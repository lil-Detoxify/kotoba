import {_electron as electron,expect} from '@playwright/test';
import path from 'node:path';import {mkdirSync} from 'node:fs';
const profile=path.resolve('.cache/desktop-qa-'+Date.now());mkdirSync(profile,{recursive:true});
const executable=process.env.KOTOBA_TEST_EXE;const args=executable?[]:['apps/windows'];args.push('--kotoba-test','--kotoba-profile='+profile);
const launch=()=>electron.launch({...(executable?{executablePath:path.resolve(executable)}:{}),args,timeout:30000});
let app=await launch();try {let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await expect(page.getByRole('heading',{name:'今天，也学一点吧。'})).toBeVisible();
await page.getByRole('link',{name:'词书',exact:true}).click();await page.getByRole('heading',{name:'日语测试词书',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'开始学习所选课程'}).click();await page.getByRole('button',{name:'显示释义'}).click();await expect(page.locator('.dictionary-entry').first()).toBeVisible();
const media=await page.evaluate(async()=>{const audio=new Audio('/audio/0.mp3');await audio.play();audio.pause();return true});expect(media).toBe(true);
await page.getByRole('button',{name:'记得',exact:false}).click();await page.getByRole('link',{name:'结束本次学习'}).click();await page.getByRole('link',{name:'今日',exact:true}).click();await expect(page.locator('.metric-row')).toContainText('1');
if(!executable)await page.screenshot({path:'docs/screenshots/windows-desktop.png',fullPage:true});await app.close();
app=await launch();page=await app.firstWindow();await expect(page.locator('.metric-row')).toContainText('1');
expect(await page.evaluate(()=>typeof window.require)).toBe('undefined');expect(errors).toEqual([]);await app.close();console.log('PASS: desktop packaged protocol, dictionary, MP3, learning, restart persistence and renderer isolation');

} finally {await app.close().catch(()=>{})}
