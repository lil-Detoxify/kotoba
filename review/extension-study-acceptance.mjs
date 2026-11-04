import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.env.KOTOBUD_EXTENSION_QA_OUTPUT ?? '../kotobud-review/extension-0.4.0-beta.1');
await mkdir(output, {recursive:true});
const profile = await mkdtemp(join(output, 'edge-profile-'));
const extension = resolve(root, process.env.KOTOBUD_EXTENSION_DIST ?? 'apps/extension/dist');
const context = await chromium.launchPersistentContext(profile, {
  channel:'msedge', headless:true, viewport:{width:390,height:844},
  args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
});
const errors = [], steps = [];
try {
  await context.route(/^https?:/, route => route.abort());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const origin = `chrome-extension://${new URL(worker.url()).hostname}`;
  // Commands sent from a worker have no sender URL in some Chromium versions;
  // use the ordinary extension page bridge for the baseline and final snapshot.
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/learning.html');
  const snapshot = () => page.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({type:'kotobud:command',method:'read',args:[]});
    if (!response.ok) throw new Error(response.error);
    return response.data;
  });
  const before = await snapshot();
  const upper = page.locator('.learning-book').filter({has:page.locator('a[href*="books/biaori-beginner-upper"]')});
  await upper.waitFor();
  assert.equal(await page.locator('.lesson-option-row').count(), 0);
  const choose = upper.getByRole('button',{name:'选择课次'});
  if (await choose.isDisabled()) await upper.getByRole('button',{name:'使用这本词书'}).click();
  await choose.click();
  assert.equal(await upper.locator('.lesson-option-row').count(), 6);
  await upper.getByRole('button',{name:/显示更多课次/}).click();
  assert.equal(await upper.locator('.lesson-option-row').count(), 12);
  await page.setViewportSize({width:320,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),320);
  await page.getByLabel('把日语用起来',{exact:true}).screenshot({path:join(output,'extension-entries-320.png')});
  await upper.screenshot({path:join(output,'extension-book-320.png')});
  const checkbox = upper.locator('.lesson-option-row').first().getByRole('checkbox');
  const checked = await checkbox.isChecked();
  const [study] = await Promise.all([page.waitForEvent('popup'),upper.locator('.book-grammar-link').click()]);
  study.setDefaultTimeout(12000);
  study.on('pageerror',error => errors.push(error.message));
  await study.getByRole('heading',{name:'标日初级上 · 语法',exact:true}).waitFor();
  assert.equal(await checkbox.isChecked(),checked);
  assert.equal(await study.locator('.grammar-group').count(),4);
  assert.equal(await study.locator('.grammar-lesson-link').count(),0);
  assert.equal(await study.getByText('标日初级下',{exact:false}).count(),0);
  await study.getByRole('button',{name:'第 1–6 课',exact:true}).click();
  assert.equal(await study.locator('.lesson-number:visible').count(),6);
  assert.equal(await study.locator('.study-nav').evaluate(nav => getComputedStyle(nav).position),'static');
  assert.equal(await study.locator('.grammar-lesson-link').count(),6);
  await study.locator('.grammar-lesson-link').first().click();
  await study.getByRole('heading',{name:'语法学习',exact:true}).waitFor();
  assert.equal(await study.locator('.lesson-picker option').count(),24);
  assert.equal(await study.locator('.lesson-picker option').last().getAttribute('value'),'24');
  await study.goBack();
  await study.locator('.grammar-lesson-link').first().waitFor();
  assert.match(study.url(),/group=0/);
  steps.push('Own-book catalog only; four collapsed groups; six lesson rows at a time; browser Back restores group; word selection unchanged');
  await study.screenshot({path:join(output,'upper-catalog-390.png'),fullPage:true});
  await study.locator('.grammar-lesson-link').first().click();
  const lesson = JSON.parse(await readFile(join(root,'apps/web/src/grammar/biaori-beginner-upper-1.json'),'utf8'));
  await study.locator('.outline-practice').evaluate(button => button.click());
  for (const [index,question] of lesson.questions.entries()) {
    const choice = index === 0 ? question.options.find(option => option !== question.answer) : question.answer;
    await study.locator('.grammar-options').getByRole('button',{name:choice,exact:true}).click();
    await study.getByRole('button',{name:'确认答案',exact:true}).click();
    await study.locator('.grammar-feedback').waitFor();
    if (index === 0) {
      const feedback = await study.locator('.grammar-feedback').innerText();
      await study.reload();
      await study.locator('.grammar-feedback').waitFor();
      assert.equal(await study.locator('.grammar-feedback').innerText(),feedback);
    }
    await study.getByRole('button',{name:index === lesson.questions.length-1 ? '查看本课小结':'下一题',exact:true}).click();
  }
  await study.getByRole('heading',{name:'本课练习已完成。',exact:true}).waitFor();
  assert.match(await study.locator('.summary-count').innerText(),/7\s*\/\s*8/);
  await study.getByRole('button',{name:'重练错题',exact:true}).click();
  await study.locator('.grammar-options').getByRole('button',{name:lesson.questions[0].answer,exact:true}).click();
  await study.getByRole('button',{name:'确认答案',exact:true}).click();
  await study.getByRole('button',{name:'查看本课小结',exact:true}).click();
  await study.getByText('首次作答记录：7 / 8，重练不会覆盖首次成绩。',{exact:true}).waitFor();
  const guestKey = `kotobud.grammar.v1:${encodeURIComponent(before.identity.partitionKey)}:biaori-beginner-upper:1`;
  const guestProgress = await study.evaluate(key => localStorage.getItem(key),guestKey);
  assert.ok(guestProgress);
  await study.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    window.__testOwner = 'synthetic-account';
    chrome.runtime.sendMessage = async (...args) => {
      const response = await original(...args);
      if (args[0]?.method === 'read' && response?.data?.identity && window.__testOwner) response.data.identity.partitionKey = window.__testOwner;
      return response;
    };
    window.dispatchEvent(new Event('kotobud:account-changed'));
  });
  await study.locator('.point-meaning').waitFor();
  assert.equal(await study.locator('.grammar-summary').count(),0);
  await study.locator('.outline-practice').evaluate(button => button.click());
  await study.locator('.grammar-options button').first().click();
  await study.getByRole('button',{name:'确认答案',exact:true}).click();
  await study.locator('.grammar-feedback').waitFor();
  await study.evaluate(() => { window.__testOwner = undefined; window.dispatchEvent(new Event('kotobud:account-changed')); });
  await study.getByRole('heading',{name:'本课练习已完成。',exact:true}).waitFor();
  assert.equal(await study.evaluate(key => localStorage.getItem(key),guestKey),guestProgress);
  assert.ok(await study.evaluate(() => localStorage.getItem('kotobud.grammar.v1:synthetic-account:biaori-beginner-upper:1')));
  steps.push('Offline lesson 1, answer recovery after reload, wrong-only retry preserves first score, synthetic account transition isolates local progress');
  await study.goto(origin + '/study.html#/books/biaori-beginner-lower');
  await study.getByRole('button',{name:'第 43–48 课',exact:true}).click();
  assert.equal(await study.locator('.grammar-lesson-link').count(),6);
  await study.locator('.grammar-lesson-link').last().click();
  await study.getByRole('heading',{name:'语法学习',exact:true}).waitFor();
  assert.equal(await study.locator('.lesson-picker option').first().getAttribute('value'),'25');
  assert.equal(await study.locator('.lesson-picker option').last().getAttribute('value'),'48');
  await study.goto(origin + '/study.html#/grammar/biaori-beginner-upper/25');
  await study.getByRole('heading',{name:'这一课还在准备中。',exact:true}).waitFor();
  steps.push('Lower-book lesson 48 and 25–48 picker; mismatched upper-book lesson 25 rejected');
  await study.goto(origin + '/study.html#/kana');
  await study.getByRole('heading',{name:'五十音学习',exact:true}).waitFor();
  await study.evaluate(() => {
    window.__media = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__media.push(this); return play.call(this); };
  });
  await study.getByRole('button',{name:'听发音',exact:true}).click();
  await study.waitForFunction(() => window.__media?.some(media => media.readyState >= 2 && media.currentTime > 0 && !media.error));
  assert.match(await study.evaluate(() => window.__media[0].src),/^chrome-extension:\/\/[^/]+\/assets\/a-/);
  await study.getByRole('button',{name:'片假名',exact:true}).click();
  await study.getByRole('button',{name:'浊音・半浊音',exact:true}).click();
  await study.getByRole('button',{name:'パ pa',exact:true}).click();
  await study.getByRole('img',{name:/パ的笔顺/}).waitFor();
  await study.getByRole('button',{name:'逐笔看',exact:true}).click();
  await study.getByText(/第 1 \/ .* 笔/).waitFor();
  await study.screenshot({path:join(output,'kana-390.png'),fullPage:true});
  await study.getByRole('button',{name:'拗音',exact:true}).click();
  assert.equal(await study.locator('.kana-cell').count(),33);
  for (const width of [320,390,1200]) {
    await study.setViewportSize({width,height:844});
    assert.equal(await study.evaluate(() => document.documentElement.scrollWidth),width);
    await study.screenshot({path:join(output,`kana-${width}.png`),fullPage:true});
  }
  steps.push('Packaged Kana audio decoded offline; katakana, semi-voiced and combined sounds; animated and stepwise strokes; 320/390/1200 px without overflow');
  const after = await snapshot();
  assert.deepEqual(after.logs,before.logs);
  assert.deepEqual(after.learning.logs,before.learning.logs);
  assert.deepEqual(after.learning.states,before.learning.states);
  assert.deepEqual(after.learning.quizAttempts,before.learning.quizAttempts);
  assert.deepEqual(after.syncQueue,before.syncQueue);
  await study.close();
  await page.reload();
  await page.locator('.start-learning').click();
  for (let index = 0; index < 10; index++) {
    await page.getByRole('button',{name:'查看答案',exact:true}).click();
    await page.locator('.rating-3').click();
  }
  const continuation = page.locator('.completion-grammar');
  await continuation.waitFor();
  assert.equal(await continuation.getAttribute('href'),origin+'/study.html#/grammar/biaori-beginner-upper/1');
  await continuation.screenshot({path:join(output,'lesson-completion.png')});
  steps.push('Ten-word new-study round offers the matching local grammar lesson; grammar and Kana themselves leave vocabulary logs, FSRS, quiz attempts and sync queue unchanged');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'acceptance.json'),JSON.stringify({passed:true,browser:'Edge MV3, isolated profile',network:'All HTTP(S) blocked',steps,errors},null,2)+'\n');
  console.log(steps);
} catch (error) {
  await writeFile(join(output,'acceptance-failure.txt'),String(error.stack ?? error));
  throw error;
} finally { await context.close(); }
