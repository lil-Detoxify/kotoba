from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json
import hashlib

repo=Path(__file__).resolve().parents[1]
out=repo.parent/'kotobud-review/cross-client-release-2026-11-04'
source=out/'extension-release'
payload={p.relative_to(source).as_posix():p.read_bytes() for p in source.rglob('*') if p.is_file()}
manifest=json.loads(payload['manifest.json'])
assert manifest['version']==manifest['version_name']=='0.4.0'
def pack(name, rows):
    path=out/name
    with ZipFile(path,'w',ZIP_DEFLATED,compresslevel=9) as archive:
        for name,data in sorted(rows.items()):
            item=ZipInfo(name,(2026,11,4,0,0,0)); item.compress_type=ZIP_DEFLATED; item.external_attr=0o644<<16
            archive.writestr(item,data)
    with ZipFile(path) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist())==set(rows)
        for name,data in rows.items(): assert archive.read(name)==data
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    (out/(path.stem+'.sha256.txt')).write_text(f'{digest}  {path.name}\n',encoding='utf8')
    return dict(file=path.name,bytes=path.stat().st_size,sha256=digest,files=len(rows),unpackedBytes=sum(map(len,rows.values())))
direct=pack('KotoBud-Extension-0.4.0.zip',payload)
with ZipFile(repo.parent/'kotobud-review/extension-release-2026-10-21/KotoBud-Edge-0.3.0-beta.7.zip') as previous:
    for name in ['_locales/zh_CN/messages.json','_locales/en_US/messages.json']: payload[name]=previous.read(name)
    previous_manifest=json.loads(previous.read('manifest.json'))
    for key in ['default_locale','name','description']: manifest[key]=previous_manifest[key]
    manifest['action']['default_title']=previous_manifest['action']['default_title']
    # Retain the publisher's existing authorization statement and current source notices.
    text=payload['DATA-SOURCES.txt'].decode('utf8')
    start=text.index('Their textbook-data redistribution authorization has not been independently confirmed.')
    end=text.index('\n',text.index('See docs/reference/TEXTBOOK_SOURCES.md.',start))
    old=previous.read('DATA-SOURCES.txt').decode('utf8')
    auth_start=old.index('On 2026-10-07 the publisher confirmed')
    auth_end=old.index('\n',old.index('it predates the publisher confirmation.',auth_start))
    text=text[:start]+old[auth_start:auth_end]+text[end:]
    payload['DATA-SOURCES.txt']=text.replace('KotoBud extension local development candidate','KotoBud extension 0.4.0 - Edge submission').encode('utf8')
    payload['INSTALL.txt']=payload['INSTALL.txt'].replace(b'The legacy textbook data is not cleared for store distribution.',b'The publisher confirmed textbook redistribution authorization on 2026-10-07; see DATA-SOURCES.txt.')
payload['manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf8')
store=pack('KotoBud-Edge-0.4.0.zip',payload)
(out/'extension-packages.json').write_text(json.dumps(dict(version='0.4.0',direct=direct,edge=store),indent=2)+'\n',encoding='utf8')
print(json.dumps(dict(direct=direct,edge=store),indent=2))
