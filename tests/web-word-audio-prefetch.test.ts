import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {audioPrefetchAllowed,createWordAudioPrefetch} from '../apps/web/src/services/word-audio-prefetch';

const caches:ReturnType<typeof createWordAudioPrefetch>[]=[];
function setup(){
  const media:any[]=[];
  vi.stubGlobal('Audio',vi.fn(function(url:string){
    const item={url,preload:'',pause:vi.fn(),load:vi.fn(),play:vi.fn(),removeAttribute:vi.fn(),onloadeddata:null,oncanplaythrough:null,onerror:null};
    media.push(item);return item;
  }));
  const cache=createWordAudioPrefetch();caches.push(cache);return {cache,media};
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('document',{visibilityState:'visible'})});
afterEach(()=>{caches.splice(0).forEach(cache=>cache.clear());vi.useRealTimers();vi.unstubAllGlobals()});
describe('small word audio warmup',()=>{
  it('prepares at most three unique clips without playing, then reuses the prepared media',()=>{
    const {cache,media}=setup();cache.prepare(['/a','/a','/b','/c','/d']);
    expect(media.map(item=>item.url)).toEqual(['/a','/b','/c']);
    expect(media.every(item=>item.play.mock.calls.length===0)).toBe(true);
    cache.prepare(['/a','/b','/c']);expect(media).toHaveLength(3);
    expect(cache.take('/b')).toBe(media[1]);expect(media[1].pause).not.toHaveBeenCalled();
    expect(cache.take('/b')).toBeUndefined();
  });
  it('unloads discarded clips and the rest when queue or voice preparation is cleared',()=>{
    const {cache,media}=setup();cache.prepare(['/a','/b']);cache.prepare(['/b','/c']);
    expect(media[0].removeAttribute).toHaveBeenCalledWith('src');cache.clear();
    expect(media.every(item=>item.pause.mock.calls.length===1)).toBe(true);expect(cache.take('/b')).toBeUndefined();
  });
  it('quietly drops failed or timed out preloads so a later attempt can create fresh media',()=>{
    const {cache,media}=setup();cache.prepare(['/a']);media[0].onerror();
    expect(cache.take('/a')).toBeUndefined();cache.prepare(['/a']);expect(media).toHaveLength(2);
    vi.advanceTimersByTime(5000);expect(cache.take('/a')).toBeUndefined();
  });
  it('does not prefetch on saved-data, offline, hidden or very slow connections',()=>{
    const {cache,media}=setup();
    for(const hints of [{onLine:false},{onLine:true,connection:{saveData:true}},{onLine:true,connection:{effectiveType:'2g'}}]){
      vi.stubGlobal('navigator',hints);expect(audioPrefetchAllowed()).toBe(false);cache.prepare(['/a']);
    }
    vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('document',{visibilityState:'hidden'});cache.prepare(['/a']);
    expect(media).toHaveLength(0);
  });
  it('keeps an already prepared clip usable when connectivity drops, without creating another download',()=>{
    const {cache,media}=setup();cache.prepare(['/a']);media[0].onloadeddata();
    vi.stubGlobal('navigator',{onLine:false});cache.prepare(['/a','/b']);
    expect(media).toHaveLength(1);expect(cache.take('/a')).toBe(media[0]);
  });
});
