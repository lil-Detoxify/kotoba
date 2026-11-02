import {afterEach,describe,expect,it,vi} from 'vitest';
import {UniContentNetworkAdapter} from '../apps/miniprogram/src/adapters/network';
afterEach(()=>vi.unstubAllGlobals());
describe('Mini content cache versions',()=>{
  it('refreshes the manifest and requests the exact book content version',async()=>{
    const urls:string[]=[];const sha='a'.repeat(64);
    vi.stubGlobal('uni',{request(options:any){urls.push(options.url);options.success({statusCode:200,data:options.url.includes('manifest.json')?{books:[{id:'jlpt-n5',sha256:sha}]}:{example:'current'}});}});
    const network=new UniContentNetworkAdapter('https://staging.kotobud.com');
    await network.request('/data/examples/v1/manifest.json');
    await network.request('/data/examples/v1/jlpt-n5.json');
    expect(urls[0]).toMatch(/^https:\/\/staging\.kotobud\.com\/data\/examples\/v1\/manifest\.json\?refresh=[a-z0-9]+$/u);
    expect(urls[1]).toBe('https://staging.kotobud.com/data/examples/v1/jlpt-n5.json?v='+sha);
  });
});
