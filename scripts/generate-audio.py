import sys,asyncio,json,pathlib
sys.path.insert(0,str(pathlib.Path('.cache/python-deps').resolve()))
import edge_tts
from urllib.request import getproxies
p=pathlib.Path('apps/web/public/audio');p.mkdir(exist_ok=True)
rows=json.loads(pathlib.Path('apps/web/src/seed.json').read_text(encoding='utf-8'))
rows+=[dict(term='中国人',reading='ちゅうごくじん'),dict(term='船便',reading='ふなびん')]
async def main():
 sem=asyncio.Semaphore(4)
 async def one(i,row):
  async with sem:
   target=p/f'{i}.mp3'
   if not target.exists() or target.stat().st_size==0:await edge_tts.Communicate(row['reading'],'ja-JP-NanamiNeural',proxy=getproxies().get('https')).save(str(target))
   return [row['term']+'|'+row['reading'],f'/audio/{i}.mp3']
 result=await asyncio.gather(*(one(i,r) for i,r in enumerate(rows)))
 pathlib.Path('apps/web/src/audio-map.json').write_text(json.dumps(dict(result),ensure_ascii=False,indent=2),encoding='utf-8')
 print(f'Generated {len(result)} Japanese pronunciations')
asyncio.run(main())

