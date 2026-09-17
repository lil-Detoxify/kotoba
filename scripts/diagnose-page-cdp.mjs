import {spawn} from 'node:child_process';
import path from 'node:path';
import Ws from 'ws';

const port = 9254;
const profile = path.resolve('.cache/page-cdp-' + Date.now());
const child = spawn(path.resolve('release/win-unpacked/Kotoba.exe'), [
  '--kotoba-test', '--kotoba-profile=' + profile,
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port
], {windowsHide: true, stdio: 'ignore'});
let target;
for (let i = 0; i < 100; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list[0]) { target = list[0]; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (!target) throw Error('page target unavailable');
console.log('target', JSON.stringify({id: target.id, url: target.url, websocket: target.webSocketDebuggerUrl}));
const socket = new Ws(target.webSocketDebuggerUrl);
socket.on('message', data => console.log('raw-cdp-response', data.toString()));
socket.on('error', error => console.log('raw-cdp-error', error.message));
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
socket.send(JSON.stringify({id: 1, method: 'Runtime.runIfWaitingForDebugger', params: {}}));
socket.send(JSON.stringify({id: 2, method: 'Runtime.evaluate', params: {expression: 'document.title', returnByValue: true}}));
await new Promise(resolve => setTimeout(resolve, 5000));
socket.close();
child.kill();
