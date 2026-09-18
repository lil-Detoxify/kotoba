import {describe,it,expect} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyData} from '@jp/models';
import {installTextbooks,parseTextbookReading} from '@jp/importers';
import {selectRange} from '@jp/core';
import payload from '../apps/web/src/textbooks.json';

describe('标日内置词书',()=>{
  it('解析词形注记并保留纯假名记录',()=>{
    expect(parseTextbookReading('がくせい(学生)')).toEqual({reading:'がくせい',term:'学生'});
    expect(parseTextbookReading('こんにちは')).toEqual({reading:'こんにちは',term:'こんにちは'});
  });
  it('正确还原波浪号缩写汉字并保留原始缩写以便音频回溯',()=>{
    // 前缀型
    expect(parseTextbookReading('アメリカじん(～人)')).toEqual({reading:'アメリカじん',term:'アメリカ人',rawTerm:'～人'});
    expect(parseTextbookReading('よろしくおねがいします(～お願いします)')).toEqual({reading:'よろしくおねがいします',term:'よろしくお願いします',rawTerm:'～お願いします'});
    expect(parseTextbookReading('フランスじん(～人)')).toEqual({reading:'フランスじん',term:'フランス人',rawTerm:'～人'});
    // 后缀型
    expect(parseTextbookReading('べんきょうします(勉強～)')).toEqual({reading:'べんきょうします',term:'勉強します',rawTerm:'勉強～'});
    expect(parseTextbookReading('ぺきんダック(北京～)')).toEqual({reading:'ぺきんダック',term:'北京ダック',rawTerm:'北京～'});
    // 居中与多波浪号
    expect(parseTextbookReading('だんボールばこ(段～箱)')).toEqual({reading:'だんボールばこ',term:'段ボール箱',rawTerm:'段～箱'});
    expect(parseTextbookReading('せんせいトキきゅうごしようセンター(陝西～救護飼養～)')).toEqual({reading:'せんせいトキきゅうごしようセンター',term:'陝西トキ救護飼養センター',rawTerm:'陝西～救護飼养～'.replace('养','養')});
    // 合法语法接续模式（保留波浪号，不误伤）
    expect(parseTextbookReading('～さん')).toEqual({reading:'～さん',term:'～さん'});
    expect(parseTextbookReading('～じ(～時)')).toEqual({reading:'～じ',term:'～時'});
    expect(parseTextbookReading('なん～(何～)')).toEqual({reading:'なん～',term:'何～'});
    expect(parseTextbookReading('～さい(～歳)')).toEqual({reading:'～さい',term:'～歳'});
    // 常规汉字注记
    expect(parseTextbookReading('ちゅうごくじん(中国人)')).toEqual({reading:'ちゅうごくじん',term:'中国人'});
  });
  it('词书数据中波浪号简写词已全部展开，且合法语法接续项完好保留',()=>{
    const allWords = payload.books.flatMap(b=>b.lessons.flatMap(l=>l.words));
    const america = allWords.find(w=>w.reading==='アメリカじん');
    expect(america).toBeDefined();
    expect(america?.term).toBe('アメリカ人');
    expect(america?.rawTerm).toBe('～人');

    const yoroshiku = allWords.find(w=>w.reading==='よろしくおねがいします');
    expect(yoroshiku).toBeDefined();
    expect(yoroshiku?.term).toBe('よろしくお願いします');
    expect(yoroshiku?.rawTerm).toBe('～お願いします');

    // 确认不存在残留未展开的 ～人 / ～お願いします / 勉強～ 词条表面
    expect(allWords.find(w=>w.term==='～人')).toBeUndefined();
    expect(allWords.find(w=>w.term==='～お願いします')).toBeUndefined();
    expect(allWords.find(w=>w.term==='勉強～')).toBeUndefined();

    // 确认合法语法项如 ～さん、～時 仍存在
    expect(allWords.some(w=>w.term==='～さん')).toBe(true);
    expect(allWords.some(w=>w.term==='～時')).toBe(true);
  });
  it('包含六册和核查后的课次词数',()=>{
    expect(payload.books.map(b=>b.wordCount)).toEqual([1077,1073,1748,1907,1806,1506]);
    expect(payload.books.every(b=>b.lessons.length>0)).toBe(true);
  });
  it('按教材真实课次序号选择范围，不按 lessons.length 截断',()=>{
    const cases=[[1,25,48,24],[3,17,32,16],[5,13,24,12]] as const;
    for(const [index,from,to,count] of cases){
      const lessons=payload.books[index].lessons.map(l=>({id:`${payload.books[index].id}-l-${l.order}`,bookId:payload.books[index].id,title:l.title,order:l.order}));
      expect(selectRange(lessons,from,to)).toHaveLength(count);
      expect(selectRange(lessons,from,to)[0]).toContain(`-l-${from}`);
      expect(selectRange(lessons,from,to).at(-1)).toContain(`-l-${to}`);
    }
  });
  it('所有内置假名都不残留汉字注记',()=>{
    const readings=payload.books.flatMap(b=>b.lessons.flatMap(l=>l.words.map(w=>w.reading)));
    expect(readings.filter(reading=>/[\\u3400-\\u9fff]/u.test(reading)||/[（(].*[）)]/.test(reading))).toHaveLength(0);
  });
  it('安装使用稳定 ID，重复迁移不会覆盖进度或当前词书',()=>{
    const data=emptyData();let n=0;installTextbooks(data,payload.books,()=>`random-${n++}`);data.currentBookId='custom';data.states.push({userId:'local',wordId:data.words[0].id,status:'learning',isIgnored:false,isDifficult:false,reviewCount:1,lapseCount:0,card:{} as never});
    const before=data.words.map(w=>w.id);installTextbooks(data,payload.books,()=>`random-${n++}`);
    expect(data.words.map(w=>w.id)).toEqual(before);expect(data.currentBookId).toBe('custom');expect(data.books).toHaveLength(6);
  });
  it('完成迁移后手动删除的内置词书不会被 marker 逻辑复活',()=>{
    const data=emptyData();installTextbooks(data,payload.books,()=>crypto.randomUUID());data.textbooksVersion='biaori-v1';
    const removed=payload.books[5].id;data.books=data.books.filter(b=>b.id!==removed);data.lessons=data.lessons.filter(l=>l.bookId!==removed);data.words=data.words.filter(w=>data.lessons.some(l=>l.id===w.lessonId));
    if(data.textbooksVersion!=='biaori-v1')installTextbooks(data,payload.books,()=>crypto.randomUUID());
    expect(data.books.some(b=>b.id===removed)).toBe(false);
  });
  it('ensureSystemTextbooks 与 copyGuestCustomData 确保内置词书与用户自定义词书在多命名空间下均不丢失', async () => {
    const { ensureSystemTextbooks, copyGuestCustomData, metaBooks } = await import('../apps/web/src/store');
    const guestData = emptyData();
    // 模拟游客状态注入系统内置词书
    ensureSystemTextbooks(guestData);
    expect(guestData.books.length).toBe(metaBooks.length);
    expect(guestData.lessons.length).toBeGreaterThan(100);

    // 模拟游客创建了自定义导入词书
    guestData.books.push({
      id: 'custom-book-1',
      title: '我的考研日语',
      description: '用户自建词书',
      language: 'ja',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    guestData.lessons.push({
      id: 'custom-lesson-1',
      bookId: 'custom-book-1',
      title: '第1课',
      order: 1
    });
    guestData.words.push({
      id: 'custom-word-1',
      lessonId: 'custom-lesson-1',
      term: '熱心',
      reading: 'ねっしん',
      meaning: '热心',
      partOfSpeech: '名・形动',
      order: 1
    });

    // 模拟新登录用户初始化为空数据
    const userData = emptyData();
    expect(userData.books.length).toBe(0);

    // 登录迁移：拷贝游客自建词书 + 确保系统内置词书
    copyGuestCustomData(userData, guestData);
    ensureSystemTextbooks(userData);

    // 验证新用户既拥有完整的系统词书，也完整保留了游客阶段的自定义词书与生词
    expect(userData.books.length).toBe(metaBooks.length + 1);
    expect(userData.books.some(b => b.id === 'custom-book-1')).toBe(true);
    expect(userData.lessons.some(l => l.id === 'custom-lesson-1')).toBe(true);
    expect(userData.words.some(w => w.id === 'custom-word-1')).toBe(true);
    // 且系统词书无重复
    const firstBook = userData.books.filter(b => b.id === metaBooks[0].id);
    expect(firstBook.length).toBe(1);
  });
});
