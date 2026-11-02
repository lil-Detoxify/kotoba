import {createSentenceAudioLookup,type SentenceAudioVoice} from '@jp/shared';
import {UniContentNetworkAdapter} from '../adapters/network';
import {MINIPROGRAM_AUDIO_ASSET_BASE_URL,assetUrl} from '../adapters/asset-url';
import {defaultPrivacyConsent} from './privacy-consent';
import {MINIPROGRAM_DICTIONARY_BASE_URL} from './dictionary-comparison';

const network=new UniContentNetworkAdapter(MINIPROGRAM_DICTIONARY_BASE_URL);
const lookup=createSentenceAudioLookup({loadJson:path=>network.request(path,{timeout:12000})});

export async function miniSentenceAudioUrl(text:string,voice:SentenceAudioVoice='female'):Promise<string|undefined> {
  if(!await defaultPrivacyConsent.isConsented())throw new Error('请先同意隐私说明，再使用例句朗读。');
  const path=await lookup.lookup(text,voice);
  return path?assetUrl(path,MINIPROGRAM_AUDIO_ASSET_BASE_URL):undefined;
}
