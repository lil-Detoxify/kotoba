import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createSentenceAudioLookup,sentenceAudioBucket} from '../packages/shared/src/sentence-audio';
const female='/audio/google/v1/a/'+'a'.repeat(64)+'.mp3';
const male='/audio/google/v1/c/'+'b'.repeat(64)+'.mp3';
const manifest={schemaVersion:1,version:'1234567890abcdef',shardCount:64};

describe('shared sentence recording lookup',()=>{
  it('loads only the requested shard and reuses it for both voices',async()=>{
    const paths:string[]=[];
    const lookup=createSentenceAudioLookup({loadJson:async path=>{paths.push(path);return path.endsWith('manifest.json')?manifest:{'日本から来ました。':{female,male}};}});
    expect(paths).toHaveLength(0);
    expect(await lookup.lookup(' 日本から来ました。 ','female')).toBe(female);
    expect(await lookup.lookup('日本から来ました。','male')).toBe(male);
    expect(paths).toEqual(['/data/sentence-audio/v1/manifest.json',`/data/sentence-audio/v1/${manifest.version}/${sentenceAudioBucket('日本から来ました。')}.json`]);
    expect(await lookup.lookup('','female')).toBeUndefined();
  });

  it('allows retry after a failed shard and keeps a cancelled lookup from requesting more',async()=>{
    let attempts=0;
    const lookup=createSentenceAudioLookup({loadJson:async path=>{
      if(path.endsWith('manifest.json'))return manifest;
      if(++attempts===1)throw Error('offline');
      return {'試験に落ちました。':{female}};
    }});
    await expect(lookup.lookup('試験に落ちました。','female')).rejects.toThrow('offline');
    expect(await lookup.lookup('試験に落ちました。','female')).toBe(female);
    expect(await lookup.lookup('試験に落ちました。','male')).toBeUndefined();
    let release!:(value:unknown)=>void,requests=0;
    const pending=createSentenceAudioLookup({loadJson:()=>{requests++;return new Promise(resolve=>{release=resolve;});}});
    const controller=new AbortController(),result=pending.lookup('日本から来ました。','female',controller.signal);
    controller.abort();release(manifest);
    await expect(result).rejects.toMatchObject({name:'AbortError'});
    expect(requests).toBe(1);
  });

  it('keeps all exported sentence paths aligned with the approved source map',()=>{
    const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
    const map=read('../apps/web/src/google-sentence-audio-map.json');
    const index=read('../apps/web/public/data/sentence-audio/v1/manifest.json');
    const shards=Array.from({length:64},(_,id)=>read(`../apps/web/public/data/sentence-audio/v1/${index.version}/${id}.json`));
    expect(index.texts).toBe(13824);
    for(const row of map.entries){
      const key=row.text.normalize('NFC').trim();
      expect(shards[sentenceAudioBucket(key)][key],key).toEqual({female:row.female,male:row.male});
    }
  });
});
