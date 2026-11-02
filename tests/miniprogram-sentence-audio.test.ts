import {readFileSync} from 'node:fs';
import {parse,compileScript} from '@vue/compiler-sfc';
import ts from 'typescript';
import {ref} from 'vue';
import {describe,it,expect,vi} from 'vitest';

function harness(resolveUrl:(text:string,voice:string)=>Promise<string|undefined>,playResult=async()=>true){
  const source=readFileSync('apps/miniprogram/src/components/MiniSentenceAudio.vue','utf8');
  const script=compileScript(parse(source).descriptor,{id:'mini-sentence-audio'}).content.replace(/^import[^\n]+\n/gmu,'').replace('export default','return');
  const code=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const lifecycle:{hide?:()=>void;show?:()=>void;unmount?:()=>void}={},players:any[]=[];
  class Player{play=vi.fn(playResult);destroy=vi.fn();constructor(){players.push(this);}}
  const lookup=vi.fn(resolveUrl),answerSound={stop:vi.fn()};
  const component=new Function('_defineComponent','ref','watch','onUnmounted','onHide','onShow','onUnload','UniAudioPlayer','getCloudflareAudioUrl','miniAnswerSound','miniSentenceAudioUrl',code)(
    (value:unknown)=>value,ref,()=>{},(fn:()=>void)=>{lifecycle.unmount=fn;},(fn:()=>void)=>{lifecycle.hide=fn;},(fn:()=>void)=>{lifecycle.show=fn;},()=>{},Player,()=>undefined,answerSound,lookup,
  );
  const props={text:'日本から来ました。',voice:'male',disabled:false};
  return {state:component.setup(props,{expose:()=>{}}),lookup,players,lifecycle,answerSound};
}

describe('Mini sentence playback lifecycle',()=>{
  it('uses the selected sentence voice and slow playback without changing study state',async()=>{
    const h=harness(async()=> 'https://kotobud.com/audio/recording.mp3');
    await h.state.play(true);
    expect(h.lookup).toHaveBeenCalledWith('日本から来ました。','male');
    expect(h.players[0].play).toHaveBeenCalledWith('https://kotobud.com/audio/recording.mp3',expect.objectContaining({slow:true}));
    expect(h.state.speaking.value).toBe(false);
    expect(h.state.error.value).toBe('');
  });

  it('cancels a pending lookup and leaving the page prevents late playback',async()=>{
    for(const action of ['stop','hide'] as const){
      let release!:(value:string)=>void;
      const h=harness(()=>new Promise(resolve=>{release=resolve;}));
      const request=h.state.play();expect(h.state.preparing.value).toBe(true);
      if(action==='stop')h.state.stop();else h.lifecycle.hide!();
      release('https://kotobud.com/audio/recording.mp3');await request;
      expect(h.players).toHaveLength(0);
      expect(h.state.preparing.value).toBe(false);
      expect(h.state.error.value).toBe('');
    }
  });

  it('shows a retryable error and can play after the connection recovers',async()=>{
    let ready=false;
    const h=harness(async()=>{if(!ready)throw Error('offline');return 'https://kotobud.com/audio/recording.mp3';});
    await h.state.play();expect(h.state.error.value).toContain('重试');
    ready=true;await h.state.play();
    expect(h.players).toHaveLength(1);expect(h.state.error.value).toBe('');
  });
});
