import {describe,expect,it} from 'vitest';
import {sentenceUsageFor} from '../apps/web/src/services/sentence-usage';

describe('usage tied to the displayed sentence',()=>{
  it('explains the form actually used, without changing its sentence or translation',()=>{
    const word={term:'急ぐ',reading:'いそぐ',partOfSpeech:'五段动词；自动词'};
    const example={ja:'急いで駅へ向かいました。',reading:'いそいでえきへむかいました。',zh:'赶忙去了车站。',cloze:{answer:'急いで',reading:'いそいで'}};
    const before=structuredClone(example);
    expect(sentenceUsageFor(word,example)).toMatchObject({kind:'verb-te',phrase:'急いで'});
    expect(example).toEqual(before);
    const past={ja:'駅まで急ぎました。',reading:'えきまでいそぎました。',zh:'赶到了车站。',cloze:{answer:'急ぎました',reading:'いそぎました'}};
    expect(sentenceUsageFor(word,past)?.kind).toBe('verb-polite-past');
  });

  it('keeps i-adjective and na-adjective patterns distinct from verbs and conditionals',()=>{
    const iAdj={term:'高い',reading:'たかい',partOfSpeech:'い形容词'};
    const adverbial={ja:'値段が高くなりました。',reading:'ねだんがたかくなりました。',zh:'价格变高了。',cloze:{answer:'高く',reading:'たかく'}};
    expect(sentenceUsageFor(iAdj,adverbial)?.kind).toBe('i-adjective-adverbial');
    const naAdj={term:'静か',reading:'しずか',partOfSpeech:'形容动词'};
    const modifier={ja:'静かな部屋です。',reading:'しずかなへやです。',zh:'是安静的房间。',cloze:{answer:'静か',reading:'しずか'}};
    expect(sentenceUsageFor(naAdj,modifier)?.kind).toBe('na-adjective-modifier');
    const conditional={ja:'静かなら勉強できます。',reading:'しずかならべんきょうできます。',zh:'如果安静就能学习。',cloze:{answer:'静か',reading:'しずか'}};
    expect(sentenceUsageFor(naAdj,conditional)).toBeUndefined();
  });

  it('does not call a suru noun a conjugated verb when the sentence uses another verb',()=>{
    const noun={term:'あくび',reading:'あくび',partOfSpeech:'名词；サ变动词；自动词'};
    const example={ja:'会議中にあくびが出て困りました。',reading:'かいぎちゅうにあくびがでてこまりました。',zh:'开会时打哈欠，很困扰。',cloze:{answer:'あくびが出て',reading:'あくびがでて'}};
    expect(sentenceUsageFor(noun,example)?.kind).toBe('suru-used-as-noun');
    const action={ja:'思わずあくびしました。',reading:'おもわずあくびしました。',zh:'不由得打了哈欠。',cloze:{answer:'あくび',reading:'あくび'}};
    expect(sentenceUsageFor(noun,action)).toMatchObject({kind:'suru-verb',phrase:'あくびしました'});
  });

  it('quotes the actual prohibition ending and ignores unrelated or ambiguous blanks',()=>{
    const word={term:'入る',reading:'はいる',partOfSpeech:'五段动词；自动词'};
    const example={ja:'ここに入ってはいけません。',reading:'ここにはいってはいけません。',zh:'不能进入这里。',cloze:{answer:'入って',reading:'はいって'}};
    expect(sentenceUsageFor(word,example)).toMatchObject({kind:'verb-prohibition',phrase:'入ってはいけません'});
    expect(sentenceUsageFor({term:'学校',reading:'がっこう',partOfSpeech:'名词'},example)).toBeUndefined();
    expect(sentenceUsageFor(word,{...example,ja:'入って、また入ってください。'})).toBeUndefined();
    expect(sentenceUsageFor({term:'本田',reading:'ほんだ',partOfSpeech:'[专]'},{ja:'本田さんが来ました。',reading:'ほんださんがきました。',zh:'本田来了。',cloze:{answer:'本田',reading:'ほんだ'}})).toBeUndefined();
  });

  it('does not attribute the end of a multiword blank to a na-adjective or i-adjective inside it',()=>{
    const nounPhrase={ja:'貧困をなくす取り組みについて話した。',reading:'ひんこんをなくすとりくみについてはなした。',zh:'谈了消除贫困的举措。',cloze:{answer:'貧困をなくす取り組み',reading:'ひんこんをなくすとりくみ'}};
    expect(sentenceUsageFor({term:'貧困',reading:'ひんこん',partOfSpeech:'名词；形容动词；の形容词'},nounPhrase)).toBeUndefined();
    const clause={ja:'高いとは思わなかった。',reading:'たかいとはおもわなかった。',zh:'当时没觉得贵。',cloze:{answer:'高いとは思わなかった',reading:'たかいとはおもわなかった'}};
    expect(sentenceUsageFor({term:'高い',reading:'たかい',partOfSpeech:'い形容词'},clause)).toBeUndefined();
  });

  it('leaves lexical time, frequency and evaluative ni expressions to word-specific notes',()=>{
    const examples=[
      {word:{term:'久しぶり',reading:'ひさしぶり',partOfSpeech:'名词；形容动词'},ja:'久しぶりに会った。',reading:'ひさしぶりにあった。'},
      {word:{term:'幸運',reading:'こううん',partOfSpeech:'名词；形容动词'},ja:'幸運にも鍵が見つかった。',reading:'こううんにもかぎがみつかった。'},
      {word:{term:'光栄',reading:'こうえい',partOfSpeech:'名词；形容动词'},ja:'光栄に思います。',reading:'こうえいにおもいます。'},
    ];
    for(const sample of examples)expect(sentenceUsageFor(sample.word,{ja:sample.ja,reading:sample.reading,zh:'对应场景的翻译',cloze:{answer:sample.word.term,reading:sample.word.reading}}),sample.word.term).toBeUndefined();
  });

  it('only attributes noun modification to a blank containing the target noun itself',()=>{
    const noun={term:'園芸',reading:'えんげい',partOfSpeech:'名词'};
    expect(sentenceUsageFor(noun,{ja:'園芸が趣味の父です。',reading:'えんげいがしゅみのちちです。',zh:'父亲以园艺为爱好。',cloze:{answer:'園芸が趣味',reading:'えんげいがしゅみ'}})).toBeUndefined();
    expect(sentenceUsageFor({term:'自家',reading:'じか',partOfSpeech:'名词'},{ja:'自家製のパンです。',reading:'じかせいのぱんです。',zh:'是自制的面包。',cloze:{answer:'自家製',reading:'じかせい'}})).toBeUndefined();
    expect(sentenceUsageFor(noun,{ja:'園芸の本です。',reading:'えんげいのほんです。',zh:'是园艺书。',cloze:{answer:'園芸',reading:'えんげい'}})?.kind).toBe('noun-modifier');
  });
});
