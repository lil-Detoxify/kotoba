// Stage this release and its shared imports, preserving unrelated Web / Mini work.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git('diff','--cached','--name-only'))throw Error('Existing staged work retained; inspect it before staging the release');
const files=[
 'apps/extension','apps/windows/package.json',
 'apps/web/src/grammar','apps/web/src/assets/kana-audio','apps/web/src/assets/word-pronunciation',
 'apps/web/src/components/KanaStrokeOrder.vue','apps/web/src/kana-strokes.json','apps/web/src/pages/Kana.vue',
 'apps/web/src/services/kana-study.ts','apps/web/src/services/grammar.ts','apps/web/src/services/grammar-navigation.ts','apps/web/src/services/audioUrl.ts',
 'packages/shared/src/grammar.ts','packages/shared/package.json',
 'scripts/platform-downloads.mjs','scripts/download-page.mjs','scripts/generate-seo-pages.mjs','scripts/release-notes.mjs',
 'docs/HANDOFF_OVERVIEW.md','docs/HANDOFF_WEB_WINDOWS.md','CHANGELOG.md',
 'tests/extension-grammar-navigation.test.ts','tests/extension-packaged-pronunciation.test.ts','tests/web-grammar.test.ts','tests/web-corrected-word-audio.test.ts',
 'review/windows/2026-11-04-v0.10.1','review/windows/2026-11-04-v0.10.1-beta.2',
 'review/extension-study-acceptance.mjs','review/package-extension-study.py',
 'review/prepare-cross-client-release.cjs','review/compare-extension-release.mjs','review/freeze-extension-release.mjs','review/package-extension-release.py',
 'review/release-cross-client-r2.mjs','review/prepare-cross-client-site.mjs','review/prepare-cross-client-preview.mjs','review/check-cross-client-production.mjs','review/verify-cross-client-public.mjs','review/stage-cross-client-release.cjs',
];
git('add','--',...files);
// The root/Web/Mini version edits belong to ongoing independent work. Stage only
// the extension's lock metadata without replacing the working file.
const lock=JSON.parse(git('show','HEAD:package-lock.json'));
lock.packages['apps/extension'].version='0.4.0';
lock.packages['apps/extension'].dependencies['vue-router']='^4.5.0';
const target=path.resolve(root,'../kotobud-review/cross-client-release-2026-11-04/staged-package-lock.json');
fs.writeFileSync(target,JSON.stringify(lock,null,2)+'\n');
const hash=git('hash-object','-w',target);
git('update-index','--cacheinfo',`100644,${hash},package-lock.json`);
console.log(git('diff','--cached','--stat'));
