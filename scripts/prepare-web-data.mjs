import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
for (const script of ['scripts/build-learning-usage.mjs', 'scripts/split-learning-examples.mjs', 'scripts/build-sentence-audio-index.mjs', 'scripts/build-sentence-audio-shards.mjs']) {
  execFileSync(process.execPath, [script], {cwd: root, stdio: 'inherit'});
}
