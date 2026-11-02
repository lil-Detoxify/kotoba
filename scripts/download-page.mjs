import { readFileSync } from 'node:fs';

// Quiet brand download selector: DESIGN_VARIANCE 6, MOTION_INTENSITY 1, VISUAL_DENSITY 4.
// Uses the existing green/paper palette and native HTML; no animation runtime is needed.
export const downloadStyles = readFileSync(new URL('./download-page.css', import.meta.url), 'utf8');

export function renderDownloadContent({ webVersion, windowsVersion, setupFile, portableFile, checksumFile, downloadsReady, extensionDownload }) {
  const extensionSizeMb = (extensionDownload.bytes / 1_000_000).toFixed(2);
  const downloadAction = (file, label, kind) => downloadsReady
    ? `<a class="download-action ${kind}" href="/downloads/${file}" aria-label="下载 Windows v${windowsVersion} ${label}"><span>下载${label}</span><span aria-hidden="true">↓</span></a>`
    : `<span class="download-action ${kind}" aria-disabled="true"><span>${label}暂不可用</span><span aria-hidden="true">↓</span></span>`;

  return `
    <div class="download-shell">
      <section class="download-intro" aria-labelledby="download-title">
        <div>
          <p class="download-eyebrow">KOTOBUD ON YOUR DEVICES <span>客户端下载与使用指引</span></p>
          <h1 id="download-title">选择 Kotobud，<br>继续你的学习。</h1>
          <p class="download-lead">为每天的日语，留一个安静的位置。<br>选择适合你的版本，继续积累每一个词。</p>
        </div>
        <div class="download-release" aria-label="当前版本与系统要求">
          <p class="release-caption">当前发布</p>
          <p class="release-number"><span>Windows</span> v${windowsVersion}</p>
          <p class="release-system">Windows 10（1809+）/ 11 · 64 位</p>
          <a href="/changelog" class="download-text-link">Web v${webVersion} · 查看更新日志 <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section class="download-options" aria-label="选择 Windows 客户端版本">
        <article class="download-option download-setup" aria-labelledby="setup-title">
          <div class="option-topline"><span class="option-label">01 / SETUP</span><span class="option-recommendation">推荐使用</span></div>
          <h2 id="setup-title">Windows 安装版</h2>
          <p class="option-description">适合在自己的电脑上长期学习。自动创建桌面快捷方式，支持常规应用管理与升级。</p>
          <dl class="option-specs">
            <div><dt>版本 / 架构</dt><dd>v${windowsVersion} · x64</dd></div>
            <div><dt>文件大小</dt><dd>约 195.5 MB</dd></div>
          </dl>
          ${downloadAction(setupFile, '安装版', 'action-primary')}
          <p class="option-file">${setupFile}</p>
          <p class="option-note">本地词典随包提供，发音资源按需加载。</p>
        </article>

        <article class="download-option download-portable" id="portable" aria-labelledby="portable-title">
          <div class="option-topline"><span class="option-label">02 / PORTABLE</span><span class="option-format">免安装</span></div>
          <h2 id="portable-title">Windows 便携版</h2>
          <p class="option-description">单文件直接运行，数据目录自包含。适合存放在 U 盘随身携带，或在无管理员权限的办公电脑上使用。</p>
          <dl class="option-specs">
            <div><dt>版本 / 架构</dt><dd>v${windowsVersion} · x64</dd></div>
            <div><dt>文件大小</dt><dd>约 195.2 MB</dd></div>
          </dl>
          ${downloadAction(portableFile, '便携版', 'action-secondary')}
          <p class="option-file">${portableFile}</p>
          <p class="option-note">Portable.exe · 无需安装即可打开。</p>
        </article>
      </section>

      <section class="download-web" aria-labelledby="web-option-title">
        <div><p class="download-eyebrow">ALSO ON THE WEB <span>v${webVersion}</span></p><h2 id="web-option-title">打开浏览器，也能开始学习。</h2><p>Chrome、Edge、Safari 等现代浏览器均可使用，支持添加到手机主屏幕。</p></div>
        <a href="/app/" class="web-option-link">打开 Web 在线版 <span aria-hidden="true">↗</span></a>
      </section>

      <section class="download-platforms" aria-label="浏览器扩展与微信小程序">
        <article class="download-option" id="extension" aria-labelledby="extension-title">
          <div class="option-topline"><span class="option-label">03 / EXTENSION</span><span class="option-format">手动安装测试版</span></div>
          <h2 id="extension-title">浏览器扩展 <small>v${extensionDownload.version}</small></h2>
          <p class="option-description">在 Chrome / Edge 桌面浏览器侧边栏查词、背词和复习，新增题型、每日计划、场景词汇、个人词库与学习统计。</p>
          <dl class="option-specs"><div><dt>安装方式</dt><dd>解压后手动加载</dd></div><div><dt>文件大小</dt><dd>约 ${extensionSizeMb} MB</dd></div></dl>
          ${extensionDownload.ready ? `<a class="download-action action-primary" href="/downloads/${extensionDownload.file}" download><span>下载扩展测试包</span><span aria-hidden="true">↓</span></a>` : '<span class="download-action action-primary" aria-disabled="true"><span>测试包暂不可用</span><span aria-hidden="true">↓</span></span>'}
          <p class="option-file">${extensionDownload.file}</p>
          <p class="option-note">Edge 商店已有正式版；此处提供最新手动安装测试包。实际侧栏、Chrome 和真实账号跨端仍待验收。</p>
          <div class="platform-links"><a class="download-text-link" href="/guide#extension">安装与保留进度的升级步骤 ↗</a>${extensionDownload.ready ? `<a class="download-text-link" href="/downloads/${extensionDownload.checksumFile}">SHA-256 校验码 ↗</a>` : ''}</div>
        </article>
        <article class="download-option" id="miniprogram" aria-labelledby="miniprogram-title">
          <div class="option-topline"><span class="option-label">04 / WECHAT</span><span class="option-format">准备中 · 尚未上线</span></div>
          <h2 id="miniprogram-title">微信小程序 <small>v0.7.4 候选</small></h2>
          <p class="option-description">已准备词书选择、背词复习、双声发音和学习统计，适合手机上的碎片时间学习。</p>
          <p class="option-note">目前尚未上传、提审或发布，没有可供公众扫码的体验二维码。开放后会在此更新入口。</p>
          <a class="download-action action-secondary" href="/guide#miniprogram"><span>查看小程序指引</span><span aria-hidden="true">↗</span></a>
          <div class="platform-links"><a class="download-text-link" href="/app/">现在使用手机 Web 版 ↗</a><a class="download-text-link" href="/changelog#miniprogram">查看小程序开发记录 ↗</a></div>
        </article>
      </section>

      <section class="download-help" aria-labelledby="download-help-title">
        <div class="download-help-heading"><p class="download-eyebrow">GOOD TO KNOW</p><h2 id="download-help-title">下载前后，<br>你可能想了解。</h2><p>安全校验、安装提示，<br>以及学习记录的同步。</p><a href="/guide" class="download-text-link">阅读学习指南 <span aria-hidden="true">↗</span></a></div>
        <div class="download-faq">
          <details open>
            <summary><span>如何核对官方 SHA-256 校验码？</span><span class="faq-toggle" aria-hidden="true"></span></summary>
            <div class="faq-answer"><p>每个官方发布的安装包和便携版均提供 SHA-256 哈希值供安全核实。你可以在终端中运行：</p><code class="checksum-command">CertUtil -hashfile ${setupFile} SHA256</code><p>${downloadsReady ? `<a href="/downloads/${checksumFile}" target="_blank" rel="noopener" class="download-text-link">查看 ${checksumFile} <span aria-hidden="true">↗</span></a>` : `<span aria-disabled="true">${checksumFile} 将在安装包开放下载后提供</span>`}</p></div>
          </details>
          <details>
            <summary><span>为什么 Windows 提示“未知发布者”？</span><span class="faq-toggle" aria-hidden="true"></span></summary>
            <div class="faq-answer"><p>Kotobud 作为独立开发者自研的免费开源教育项目，目前尚未购买昂贵的商业数字签名证书（EV Code Signing Certificate）。Windows SmartScreen 会对新发布的无商业签名软件弹出“Windows 已保护你的电脑”提示。</p><p><strong>解决方法：</strong>在提示窗口中点击 <code>“更多信息” (More Info)</code>，然后点击 <code>“仍要运行” (Run anyway)</code> 即可正常安装与运行。Kotobud 绝不包含任何恶意代码或广告插件。</p></div>
          </details>
          <details>
            <summary><span>如何同步桌面与手机、网页的学习记录？</span><span class="faq-toggle" aria-hidden="true"></span></summary>
            <div class="faq-answer"><p>在 Windows 客户端右上角点击“登录并开启云同步”，使用你的邮箱接收验证码完成登录。随后在手机或电脑浏览器中登录同一个账号，两端的数据便会自动保持一致。</p><p><a href="/guide#sync" class="download-text-link">多端数据同步与备份指南 <span aria-hidden="true">↗</span></a></p></div>
          </details>
          <details>
            <summary><span>发布文件名和版本号如何区分？</span><span class="faq-toggle" aria-hidden="true"></span></summary>
            <div class="faq-answer"><p>当前 Windows v${windowsVersion} 安装包与便携版文件名统一为 <code>KotoBud-${windowsVersion}-Windows-x64-...</code>。Web 在线版已更新至 v${webVersion}。</p><p><a href="/about#brand" class="download-text-link">Kotobud 品牌命名由来 <span aria-hidden="true">↗</span></a> · <a href="/changelog" class="download-text-link">版本更新日志 <span aria-hidden="true">↗</span></a></p></div>
          </details>
        </div>
      </section>
      <div class="download-endnote"><span>ことばを、少しずつ。</span><a href="/features" class="download-text-link">了解功能特性 <span aria-hidden="true">↗</span></a></div>
    </div>
  `;
}
