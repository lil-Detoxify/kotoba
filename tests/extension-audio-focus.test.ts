import {afterEach,describe,it,expect,vi} from 'vitest';
import {createExtensionPronunciation} from '../apps/extension/src/audio';
import {claimExtensionAudioFocus,releaseExtensionAudioFocus} from '../apps/extension/src/audio-focus';
afterEach(()=>vi.unstubAllGlobals());
describe('extension word and sentence audio focus',()=>{
  it('stops a word for a sentence and stops the sentence when the word is replayed',async()=>{
    const players:any[]=[];
    class AudioMock {
      pause=vi.fn();play=vi.fn(async()=>{});load=vi.fn();removeAttribute=vi.fn();
      constructor(public src:string){players.push(this);}
    }
    vi.stubGlobal('Audio',AudioMock);
    const wordPlayer=createExtensionPronunciation();
    const word={id:'custom-focus',lessonId:'custom-book-l-1',term:'猫',reading:'ねこ',meaning:'猫',order:1,audioUrl:'https://kotobud.com/audio/focus-test.mp3'};
    expect(await wordPlayer.play(word)).toBe(true);
    const stopSentence=vi.fn();claimExtensionAudioFocus(stopSentence);
    expect(players[0].pause).toHaveBeenCalled();expect(wordPlayer.playing.value).toBe(false);
    expect(await wordPlayer.play(word)).toBe(true);expect(stopSentence).toHaveBeenCalledOnce();
    wordPlayer.stop();releaseExtensionAudioFocus(stopSentence);
  });
});
