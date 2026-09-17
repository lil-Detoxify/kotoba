import {describe,it,expect} from 'vitest';import {createRequire} from 'node:module';import path from 'node:path';
const require=createRequire(import.meta.url);const {assetPath}=require('../apps/windows/protocol.cjs') as {assetPath:(url:string,root:string)=>string|null};
const root=path.resolve('dist');
describe('Windows static protocol boundary',()=>{
 it('resolves home, dictionary and audio inside packaged assets',()=>{expect(assetPath('kotoba://app/',root)).toBe(path.join(root,'index.html'));expect(assetPath('kotoba://app/dictionary/25.json',root)).toBe(path.join(root,'dictionary','25.json'));expect(assetPath('kotoba://app/audio/1.mp3',root)).toBe(path.join(root,'audio','1.mp3'))});
 it.each(['https://example.com/','kotoba://other/index.html','kotoba://app/%2e%2e%2fpackage.json','kotoba://app/%5c..%5csecret','kotoba://app/%00','kotoba://app/%zz'])('rejects invalid or escaping URL %s',url=>{expect(assetPath(url,root)).toBeNull()});
});
