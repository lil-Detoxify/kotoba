from pathlib import Path
import hashlib
import json
import re
import shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
BASE = ROOT.parent / 'kotobud-review/extension-release-2026-10-21/site-release'
SITE = HERE / 'site-release'
VERSION = '0.9.0-beta.2'
EXPECTED_WORKER = '888964553e473fe77d4b64cbd626fec403de8e6a5c14196c33bbe8491d2cbc1b'
EXPECTED_MAIN = 'b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295'
OLD_VERSION_PATTERN = r'(\d+\.\d+\.\d+)'
NEW_VERSION_PATTERN = r'(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?)'
WINDOWS_LOG = '''          <h2 id="windows">Windows 桌面版</h2>
          <div class="version-header"><span class="version-tag">v0.9.0-beta.2</span><span class="version-date">2026 年 10 月 21 日 · 当前官网下载版本</span></div>
          <ul><li>安装版与便携版同步 Web 0.9.0 的每日学习计划、场景学习、动词活用、个人词库、提示音与学习统计。</li><li>支持假名键入、听写及多词典对照；教材词典与日文维基词典随安装包提供，可在本地查阅。</li><li>保留原有用户数据目录与账号同步方式，提供 Windows x64 安装版、免安装便携版和 SHA-256 校验清单。</li></ul>
          <p><a href="/download">下载 Windows 客户端 ↗</a></p>
          <p><strong>历史版本 · v0.7.3（2026 年 9 月 30 日）</strong></p>
          <p>官网、页面切换、学习卡片和设置反馈优化，支持系统减少动态效果。</p>'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def update_once(text, old, new, label):
    if old not in text and new in text:
        return text
    if text.count(old) != 1:
        raise RuntimeError(f'{label}: expected one baseline occurrence, got {text.count(old)}')
    return text.replace(old, new)


def worker_update(text):
    for name in ('downloadMatch', 'releaseMatch', 'checksumMatch'):
        pattern = re.compile(rf'    const {name} = [^\n]+')
        matches = list(pattern.finditer(text))
        if len(matches) != 1:
            raise RuntimeError(f'Expected one {name} route')
        old = matches[0].group()
        if NEW_VERSION_PATTERN in old:
            continue
        if old.count(OLD_VERSION_PATTERN) != 1:
            raise RuntimeError(f'Unexpected {name} version pattern')
        text = text[:matches[0].start()] + old.replace(OLD_VERSION_PATTERN, NEW_VERSION_PATTERN) + text[matches[0].end():]
    return text


def windows_log(text):
    pattern = re.compile(r'          <h2 id="windows">Windows 桌面版</h2>.*?(?=\n        </section>)', re.S)
    if len(pattern.findall(text)) != 1:
        raise RuntimeError('Expected one Windows changelog section')
    return pattern.sub(lambda _: WINDOWS_LOG, text)


def prepare_sources():
    seo = ROOT / 'scripts/generate-seo-pages.mjs'
    text = seo.read_text(encoding='utf-8')
    text = update_once(text, "const WINDOWS_DOWNLOAD_VERSION = '0.7.3';", f"const WINDOWS_DOWNLOAD_VERSION = '{VERSION}';", 'source Windows version')
    text = windows_log(text)
    # Keep the historical 0.7.3 entry independent of the current download version.
    text = text.replace('Windows v${WINDOWS_DOWNLOAD_VERSION} 安装版与便携版同步本轮页面、学习卡片和设置反馈优化', 'Windows v0.7.3 安装版与便携版同步本轮页面、学习卡片和设置反馈优化')
    seo.write_text(text, encoding='utf-8', newline='\n')
    page = ROOT / 'scripts/download-page.mjs'
    text = page.read_text(encoding='utf-8')
    text = update_once(text, '约 301.2 MB', '约 183.7 MB', 'source installer size')
    text = update_once(text, '约 301.0 MB', '约 183.5 MB', 'source portable size')
    text = update_once(text, '离线辞书与资源按需云端缓存。', '本地词典随包提供，发音资源按需加载。', 'source bundled dictionaries note')
    page.write_text(text, encoding='utf-8', newline='\n')
    worker = ROOT / 'scripts/cloudflare-worker.js'
    worker.write_text(worker_update(worker.read_text(encoding='utf-8')), encoding='utf-8', newline='\n')


def main():
    baseline = {str(p.relative_to(BASE)).replace('\\', '/'): p.read_bytes() for p in BASE.rglob('*') if p.is_file()}
    if digest(baseline['_worker.js']) != EXPECTED_WORKER or digest(baseline['assets/main-HbacATkW.js']) != EXPECTED_MAIN:
        raise RuntimeError('Published baseline does not match the approved site')
    if SITE.exists():
        raise RuntimeError('Use a fresh output directory; existing candidate was preserved')
    shutil.copytree(BASE, SITE)
    prepare_sources()
    changed = []
    for rel, data in baseline.items():
        text = None
        if rel == '_worker.js':
            text = worker_update(data.decode('utf-8'))
        elif rel.endswith('.html') and '0.7.3' in data.decode('utf-8'):
            text = data.decode('utf-8')
            if rel in ('download.html', 'download/index.html'):
                text = text.replace('0.7.3', VERSION)
                text = update_once(text, '约 301.2 MB', '约 183.7 MB', 'installer size')
                text = update_once(text, '约 301.0 MB', '约 183.5 MB', 'portable size')
                text = update_once(text, '离线辞书与资源按需云端缓存。', '本地词典随包提供，发音资源按需加载。', 'bundled dictionaries note')
                for name, label, kind in (('Setup', '安装版', 'primary'), ('Portable', '便携版', 'secondary')):
                    disabled = f'<span class="download-action action-{kind}" aria-disabled="true"><span>{label}暂不可用</span><span aria-hidden="true">↓</span></span>'
                    enabled = f'<a class="download-action action-{kind}" href="/downloads/KotoBud-{VERSION}-Windows-x64-{name}.exe" aria-label="下载 Windows v{VERSION} {label}"><span>下载{label}</span><span aria-hidden="true">↓</span></a>'
                    text = update_once(text, disabled, enabled, f'{name} download action')
                text = update_once(text, f'<span aria-disabled="true">SHA256SUMS-{VERSION}.txt 将在安装包开放下载后提供</span>', f'<a href="/downloads/SHA256SUMS-{VERSION}.txt" target="_blank" rel="noopener" class="download-text-link">查看 SHA256SUMS-{VERSION}.txt <span aria-hidden="true">↗</span></a>', 'checksum download link')
            elif rel in ('changelog.html', 'changelog/index.html'):
                head, body = text.split('<body', 1)
                text = head.replace('Windows v0.7.3', f'Windows v{VERSION}') + '<body' + body
                text = windows_log(text)
                text = text.replace('下载当前 Windows v0.7.3 客户端', f'下载当前 Windows v{VERSION} 客户端')
            else:
                text = text.replace('Windows 0.7.3', f'Windows {VERSION}').replace('Windows v0.7.3', f'Windows v{VERSION}')
        if text is not None:
            candidate = text.encode('utf-8')
            if candidate != data:
                (SITE / rel).write_bytes(candidate)
                changed.append({'file': rel, 'beforeSha256': digest(data), 'afterSha256': digest(candidate)})
    expected = {'_worker.js', 'index.html', 'features.html', 'features/index.html', 'guide.html', 'guide/index.html', 'download.html', 'download/index.html', 'changelog.html', 'changelog/index.html'}
    if {item['file'] for item in changed} != expected:
        raise RuntimeError(f'Unexpected changed files: {changed}')
    actual = {str(p.relative_to(SITE)).replace('\\', '/'): p.read_bytes() for p in SITE.rglob('*') if p.is_file()}
    if actual.keys() != baseline.keys():
        raise RuntimeError('Site inventory changed')
    for rel in actual.keys() - expected:
        if actual[rel] != baseline[rel]:
            raise RuntimeError(f'Unrelated site file changed: {rel}')
    output = {'status': 'prepared', 'version': VERSION, 'fileCount': len(actual), 'changedFiles': changed, 'mainBundleSha256': digest(actual['assets/main-HbacATkW.js']), 'workerSha256': digest(actual['_worker.js']), 'extensionSha256': digest(actual['downloads/KotoBud-Extension-0.3.0-beta.7.zip']), 'existingWebSettingsVersion': '0.7.3', 'existingVersionedDownloadsPreserved': True}
    (HERE / 'site-verification.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    checksum = (HERE.parent / 'SHA256SUMS.txt').read_bytes().replace(b'  packages/', b'  ')
    (HERE / f'SHA256SUMS-{VERSION}.txt').write_bytes(checksum)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
