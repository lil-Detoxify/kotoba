"""Freeze the verified extension build as a local test ZIP and check every entry."""
from pathlib import Path
import hashlib
import json
import zipfile

repo = Path(__file__).resolve().parents[1]
source = repo / 'apps/extension/dist'
output = repo.parent / 'kotobud-review/extension-0.4.0-beta.1'
output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
assert manifest['version_name'] == '0.4.0-beta.1'
paths = sorted(path for path in source.rglob('*') if path.is_file())
assert all(not path.is_symlink() for path in paths)
archive = output / 'KotoBud-Extension-0.4.0-beta.1.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for path in paths:
        entry = zipfile.ZipInfo(path.relative_to(source).as_posix(), date_time=(2026, 11, 4, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        package.writestr(entry, path.read_bytes())
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert set(package.namelist()) == {path.relative_to(source).as_posix() for path in paths}
    for path in paths:
        assert package.read(path.relative_to(source).as_posix()) == path.read_bytes()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
report = {
    'version': manifest['version_name'], 'file': archive.name,
    'bytes': archive.stat().st_size, 'sha256': digest,
    'files': len(paths), 'unpackedBytes': sum(path.stat().st_size for path in paths),
    'byteIdenticalEntries': len(paths),
    'packagedMp3Clips': sum(path.suffix == '.mp3' for path in paths),
    'permissions': manifest['permissions'], 'hostPermissions': manifest['host_permissions'],
    'published': False,
}
(output / 'package-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(output / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
