type ConnectionHint={saveData?:boolean;effectiveType?:string};

export function audioPrefetchAllowed():boolean{
  if(typeof document!=='undefined'&&document.visibilityState==='hidden')return false;
  if(typeof navigator==='undefined')return true;
  const connection=(navigator as Navigator&{connection?:ConnectionHint}).connection;
  return navigator.onLine!==false&&!connection?.saveData&&!['slow-2g','2g'].includes(connection?.effectiveType??'');
}

/** Small media-only warmup. It never plays, writes storage, or generates new audio. */
export function createWordAudioPrefetch(limit=3){
  const maximum=Number.isFinite(limit)?Math.min(3,Math.max(0,Math.trunc(limit))):3;
  type Entry={media:HTMLAudioElement;timer?:ReturnType<typeof setTimeout>;ready:boolean};
  const entries=new Map<string,Entry>();
  function detach(entry:Entry){
    if(entry.timer)clearTimeout(entry.timer);
    entry.timer=undefined;
    entry.media.onloadeddata=null;entry.media.oncanplaythrough=null;entry.media.onerror=null;
  }
  function release(url:string,entry:Entry){
    if(entries.get(url)!==entry)return;
    entries.delete(url);detach(entry);
    try{entry.media.pause();entry.media.removeAttribute?.('src');entry.media.load?.()}catch{/* Warmup must not interrupt learning. */}
  }
  function clear(){for(const [url,entry] of entries)release(url,entry)}
  function prepare(urls:readonly string[]){
    const wanted=[...new Set(urls.filter(url=>typeof url==='string'&&!!url))].slice(0,maximum);
    const allowed=audioPrefetchAllowed();
    for(const [url,entry] of entries){if(!wanted.includes(url)||!allowed&&!entry.ready)release(url,entry)}
    if(!allowed||typeof Audio==='undefined')return;
    for(const url of wanted){
      if(entries.has(url))continue;
      try{
        const media=new Audio(url);media.preload='auto';
        const entry:Entry={media,ready:false};entries.set(url,entry);
        const ready=()=>{
          if(entries.get(url)!==entry)return;
          entry.ready=true;if(entry.timer)clearTimeout(entry.timer);entry.timer=undefined;
        };
        media.onloadeddata=ready;media.oncanplaythrough=ready;
        media.onerror=()=>release(url,entry);
        entry.timer=setTimeout(()=>release(url,entry),5000);
        media.load?.();
      }catch{const entry=entries.get(url);if(entry)release(url,entry)}
    }
  }
  function take(url:string):HTMLAudioElement|undefined{
    const entry=entries.get(url);if(!entry)return undefined;
    entries.delete(url);detach(entry);return entry.media;
  }
  return {prepare,take,clear};
}
