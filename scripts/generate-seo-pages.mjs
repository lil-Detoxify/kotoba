import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { renderLandingContent } from './landing-page.mjs';
import { renderDownloadContent, downloadStyles } from './download-page.mjs';
import { prepareExtensionDownload } from './platform-downloads.mjs';
import { recentWebReleaseNotes, currentWindowsReleaseNotes } from './release-notes.mjs';

const INDEXNOW_KEY = '4b68e91c784e4b5bb8972cae6c7104f2';
const DOMAIN = 'https://kotobud.com';
const RELEASE_VERSION = JSON.parse(readFileSync(pathResolve(import.meta.dirname, '../package.json'), 'utf8')).version;
const WINDOWS_DOWNLOAD_VERSION = '0.9.3';
const WINDOWS_SETUP_FILE = `KotoBud-${WINDOWS_DOWNLOAD_VERSION}-Windows-x64-Setup.exe`;
const WINDOWS_PORTABLE_FILE = `KotoBud-${WINDOWS_DOWNLOAD_VERSION}-Windows-x64-Portable.exe`;
const WINDOWS_CHECKSUM_FILE = `SHA256SUMS-${WINDOWS_DOWNLOAD_VERSION}.txt`;
const brandStyles = readFileSync(pathResolve(import.meta.dirname, '../apps/web/src/brand.css'), 'utf8');

function renderBrandIdentity({ tagline = true, compact = false } = {}) {
  return `<span class="brand-identity${compact ? ' brand-identity--compact' : ''}">
    <img class="brand-identity-mark" src="/brand/kotobud-mark.svg" alt="" width="40" height="40" aria-hidden="true">
    <span class="brand-identity-copy">
      <img class="brand-identity-wordmark" src="/brand/kotobud-wordmark.svg" alt="Kotobud" width="1009" height="195">
      ${tagline ? '<small class="brand-identity-tagline">每天，认识一点日语。</small>' : ''}
    </span>
  </span>`;
}

function getSharedStyles() {
  return `
    :root {
      --bg: #f7f8f4;
      --card-bg: #fffefb;
      --card-subtle: #edf2e7;
      --text-main: #273c35;
      --text-muted: #69746b;
      --text-light: #8a958b;
      --green: #365d49;
      --green-hover: #274b38;
      --green-light: #eaf0e3;
      --border: #dfe5db;
      --border-accent: #c0ceb2;
      --font-sans: "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif;
      --font-serif: "Yu Mincho", "Noto Serif JP", "Songti SC", serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .container {
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 24px;
    }
    header.site-header {
      background: rgba(247, 248, 244, 0.95);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 72px;
    }
    .brand-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--text-main);
    }
    .brand-mark {
      background: var(--green);
      color: #fff;
      display: grid;
      place-items: center;
      width: 38px;
      height: 42px;
      border-radius: 10px 4px 10px 4px;
      font-family: var(--font-serif);
      font-size: 23px;
      line-height: 1;
    }
    .brand-logo small {
      display: block;
      font-size: 10px;
      letter-spacing: 1px;
      font-weight: 400;
      color: var(--text-muted);
      margin-top: 2px;
    }
    nav.site-nav {
      display: flex;
      align-items: center;
      gap: 24px;
    }
    nav.site-nav a {
      font-size: 14px;
      color: var(--text-muted);
      transition: color 0.15s;
    }
    nav.site-nav a:hover, nav.site-nav a.active {
      color: var(--green);
      font-weight: 600;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 9px 18px;
      border-radius: 7px;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text-main);
      cursor: pointer;
      transition: all 0.18s ease;
      text-decoration: none;
    }
    .btn:hover {
      background: #eaf0e7;
    }
    .btn-primary {
      background: var(--green);
      border-color: var(--green);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--green-hover);
      border-color: var(--green-hover);
      color: #fff;
    }
    .btn-lg {
      padding: 13px 26px;
      font-size: 15px;
      border-radius: 8px;
    }
    .hero-section {
      padding: 68px 0 54px;
      text-align: center;
    }
    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 5px 14px;
      border-radius: 20px;
      background: var(--green-light);
      color: var(--green);
      border: 1px solid var(--border-accent);
      margin-bottom: 24px;
      font-weight: 500;
    }
    h1.hero-title {
      font-size: 40px;
      line-height: 1.35;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: var(--text-main);
      margin-bottom: 20px;
    }
    p.hero-desc {
      font-size: 17px;
      color: var(--text-muted);
      max-width: 740px;
      margin: 0 auto 36px;
      line-height: 1.8;
    }
    .cta-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 36px;
    }
    .feature-strip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 32px;
      color: var(--text-muted);
      font-size: 13px;
      padding: 18px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .feature-strip span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .content-section {
      padding: 60px 0;
    }
    .section-header {
      text-align: center;
      margin-bottom: 48px;
    }
    .section-header h2 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-main);
    }
    .section-header p {
      color: var(--text-muted);
      font-size: 15px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 28px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 28px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 30px 26px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      box-shadow: 0 8px 24px rgba(39, 60, 53, 0.06);
    }
    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--card-subtle);
      color: var(--green);
      display: grid;
      place-items: center;
      font-size: 20px;
      margin-bottom: 18px;
    }
    .card h3 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 10px;
      color: var(--text-main);
    }
    .card p {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.75;
    }
    .card ul {
      margin-top: 12px;
      padding-left: 20px;
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.8;
    }
    .highlight-box {
      background: var(--green-light);
      border: 1px solid var(--border-accent);
      border-radius: 14px;
      padding: 38px 42px;
      margin: 40px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
    }
    .highlight-box h3 {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 10px;
    }
    .highlight-box p {
      font-size: 14px;
      color: #495e43;
      max-width: 600px;
    }
    .quote-block {
      background: var(--card-bg);
      border-left: 4px solid var(--green);
      padding: 20px 24px;
      border-radius: 0 8px 8px 0;
      margin: 24px 0;
      font-size: 14px;
      color: var(--text-muted);
    }
    .meta-tag {
      display: inline-block;
      padding: 2px 8px;
      background: var(--card-subtle);
      color: var(--green);
      font-size: 11px;
      border-radius: 4px;
      margin-right: 6px;
      font-weight: 500;
    }
    /* Page specific content */
    .article-body {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 44px 48px;
      margin-bottom: 60px;
    }
    .article-body h2 {
      font-size: 24px;
      margin: 36px 0 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
      color: var(--text-main);
    }
    .article-body h2:first-child {
      margin-top: 0;
    }
    .article-body h3 {
      font-size: 18px;
      margin: 24px 0 10px;
      color: var(--text-main);
    }
    .article-body p {
      font-size: 15px;
      color: var(--text-muted);
      margin-bottom: 16px;
      line-height: 1.85;
    }
    .article-body ul, .article-body ol {
      margin: 14px 0 22px 24px;
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.85;
    }
    .article-body li {
      margin-bottom: 8px;
    }
    .article-body code {
      background: var(--card-subtle);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      font-family: monospace;
      color: var(--text-main);
    }
    .platform-log-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 24px; }
    .platform-log-nav a { display: inline-block; padding: 9px 16px; border: 1px solid var(--border-accent); border-radius: 24px; font-size: 14px; color: var(--green); }
    .platform-log-nav a:hover { background: var(--green-light); }
    .platform-log-nav a:focus-visible, .platform-testing summary:focus-visible { outline: 3px solid var(--green); outline-offset: 4px; }
    .article-body [id] { scroll-margin-top: 100px; }
    .platform-steps { padding-left: 24px; margin: 16px 0; }
    .platform-steps li { padding-left: 4px; margin: 12px 0; }
    .platform-steps code { overflow-wrap: anywhere; }
    .platform-testing { margin-top: 20px; padding: 16px 20px; border: 1px solid var(--border); border-radius: 10px; }
    .platform-testing summary { cursor: pointer; font-weight: 600; }
    .platform-testing p { margin-top: 14px; }
    .version-item {
      padding: 24px 0;
      border-bottom: 1px solid var(--border);
    }
    .version-item:last-child {
      border-bottom: none;
    }
    .version-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 14px;
    }
    .version-tag {
      font-size: 16px;
      font-weight: 700;
      color: var(--green);
    }
    .version-date {
      font-size: 12px;
      color: var(--text-light);
    }
    .download-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .download-card h3 {
      font-size: 20px;
      margin-bottom: 8px;
    }
    .download-card p {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }
    footer.site-footer {
      border-top: 1px solid var(--border);
      padding: 48px 0 32px;
      background: #f1f3ec;
      color: var(--text-muted);
      font-size: 13px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 36px;
      margin-bottom: 36px;
    }
    .footer-col h4 {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
      color: var(--text-main);
    }
    .footer-col ul {
      list-style: none;
    }
    .footer-col li {
      margin-bottom: 10px;
    }
    .footer-col a {
      color: var(--text-muted);
      transition: color 0.15s;
    }
    .footer-col a:hover {
      color: var(--green);
    }
    .footer-bottom {
      border-top: 1px solid var(--border);
      padding-top: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-light);
    }
    @media (max-width: 900px) {
      .grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .highlight-box { flex-direction: column; text-align: center; }
    }
    @media (max-width: 680px) {
      h1.hero-title { font-size: 28px; }
      p.hero-desc { font-size: 15px; }
      nav.site-nav { display: none; }
      .header-actions .btn { font-size: 12px; padding: 8px 10px; white-space: nowrap; }
      .header-actions .btn > span:last-child { display: none; }
      .grid-3, .grid-2 { grid-template-columns: 1fr; }
      .article-body { padding: 28px 20px; }
      .footer-grid { grid-template-columns: 1fr; gap: 24px; }
      .footer-bottom { flex-direction: column; gap: 12px; text-align: center; }
      .feature-strip { gap: 16px; font-size: 12px; }
    }
    @media (max-width: 380px) { .brand-logo small { display: none; } }
    ${brandStyles}
  `;
}

function renderHeader(activePath = '/') {
  return `
    <header class="site-header">
      <div class="container nav-inner">
        <a href="/" class="brand-logo" title="Kotobud 日语背词与复习工具" aria-label="Kotobud 首页">
          ${renderBrandIdentity()}
        </a>
        <nav class="site-nav" id="public-navigation" aria-label="产品导航">
          <a href="/features" class="${activePath === '/features' ? 'active' : ''}">功能特性</a>
          <a href="/download" class="${activePath === '/download' ? 'active' : ''}">客户端下载</a>
          <a href="/guide" class="${activePath === '/guide' ? 'active' : ''}">学习指南</a>
          <a href="/about" class="${activePath === '/about' ? 'active' : ''}">关于产品</a>
          <a href="/changelog" class="${activePath === '/changelog' ? 'active' : ''}">更新日志</a>
        </nav>
        <div class="header-actions">
          ${activePath === '/' ? '<button type="button" class="landing-menu" aria-label="展开产品导航" aria-controls="public-navigation" aria-expanded="false">☰</button>' : ''}
          <a href="/app/" class="btn btn-primary" id="topbar-app-btn">
            <span>进入在线学习</span>
            <span style="font-size: 11px; opacity: 0.85;">Web App</span>
          </a>
        </div>
      </div>
    </header>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-col">
            <div class="brand-logo" style="margin-bottom: 12px;">
              ${renderBrandIdentity({ tagline: false, compact: true })}
            </div>
            <p style="font-size: 13px; line-height: 1.7; max-width: 320px; margin-bottom: 14px;">
              每天，认识一点日语。Kotobud 是一款专注高效的日语背词与复习工具（Japanese vocabulary learning and review app），内置新版标准日本语全六册词书与现代 FSRS 科学间隔重复算法。
            </p>
            <p style="font-size: 12px; color: var(--text-light);">
              ことばを、少しずつ。<br>持之以恒，终有回响。
            </p>
          </div>
          <div class="footer-col">
            <h4>产品与下载</h4>
            <ul>
              <li><a href="/app/">Web 在线背词版</a></li>
              <li><a href="/download">Windows 桌面端安装包</a></li>
              <li><a href="/download#portable">Windows 绿色便携版</a></li>
              <li><a href="/download#extension">浏览器扩展测试版</a></li>
              <li><a href="/guide#miniprogram">微信小程序使用指引</a></li>
              <li><a href="/features">标日词书与 FSRS 算法特性</a></li>
              <li><a href="/changelog">版本更新日志 (v${RELEASE_VERSION})</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>学习与指南</h4>
            <ul>
              <li><a href="/guide">标日六册学习路径</a></li>
              <li><a href="/guide#fsrs">FSRS 间隔复习打分准则</a></li>
              <li><a href="/guide#habits">高效背词记忆法则</a></li>
              <li><a href="/guide#sync">多端云同步说明</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>关于与合规</h4>
            <ul>
              <li><a href="/about">Kotobud 产品初心</a></li>
              <li><a href="/about#brand">品牌命名（Kotoba 到 Kotobud）</a></li>
              <li><a href="/about#license">JMdict / EDICT 开源许可</a></li>
              <li><a href="/sitemap.xml">网站地图 (Sitemap)</a></li>
              <li><a href="/robots.txt">Robots.txt</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; 2026 Kotobud. 保留所有权利。词库遵循开源辞书与相关版权协议。</span>
          <span>独立开发 · 纯净无广告 · 本地优先保护隐私</span>
        </div>
      </div>
    </footer>
  `;
}

function renderHtmlDocument({
  title,
  description,
  canonicalUrl,
  activePath,
  jsonLd,
  bodyContent,
  headExtra = '',
  bodyClass = ''
}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#f7f8f4">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="Kotobud, 日语背词, 日语背词软件, 日语学习, 标日词汇, 标准日本语, FSRS, 日语单词, 日语复习, JLPT背词, Japanese vocabulary learning">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/svg+xml" href="/brand/kotobud-mark.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/brand/kotobud-icon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <meta name="msvalidate.01" content="B54034535F2BC5D891C5E32773794D82">

  <!-- Open Graph / Social -->
  <meta property="og:site_name" content="Kotobud">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${DOMAIN}/brand/kotobud-icon-512.png">
  <meta property="og:image:alt" content="Kotobud 日语背词与复习工具">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${DOMAIN}/brand/kotobud-icon-512.png">

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>

  <style>
${getSharedStyles()}
  </style>
  ${headExtra}
</head>
<body class="${bodyClass}">
  ${bodyClass === 'landing-page' ? '<a href="#main-content" class="skip-link">跳到产品介绍</a>' : ''}
  ${renderHeader(activePath)}
  <main id="main-content">
    ${bodyContent}
  </main>
  ${renderFooter()}
  <script>
    // Seamless routing for Electron desktop app & legacy hash bookmarks
    (function() {
      if (window.location.protocol === 'kotoba:' || navigator.userAgent.includes('Electron')) {
        window.location.replace('/app.html');
        return;
      }
      var isHomePage = window.location.pathname === '/' || window.location.pathname === '/index.html';
      var legacyPath = window.location.hash.slice(1).split(/[?#]/)[0];
      var legacyRoutes = ['/', '/books', '/import', '/study', '/difficult', '/ignored', '/stats', '/settings'];
      var isLegacyRoute = legacyRoutes.includes(legacyPath) || /^[/]books[/][^/]+$/.test(legacyPath);
      if (isHomePage && isLegacyRoute) {
        window.location.replace('/app/' + window.location.hash);
        return;
      }
      // Check local storage for existing study progress
      try {
        var hasUser = localStorage.getItem('kotobud_auth') || localStorage.getItem('kotoba_auth');
        if (hasUser) {
          var btn = document.getElementById('topbar-app-btn');
          if (btn) {
            btn.innerHTML = '<span>继续学习</span><span style="font-size:11px;opacity:0.85;">Web App</span>';
          }
          var heroBtn = document.getElementById('hero-primary-btn');
          if (heroBtn) {
            heroBtn.innerHTML = '<span>继续上次学习</span><span style="font-size:12px;opacity:0.85;">进入 Web App →</span>';
          }
        }
      } catch(e) {}
    })();
  </script>
</body>
</html>
`;
}

// 1. Homepage
function generateHomePage(landingHead = '') {
  const title = 'Kotobud – 日语背词与复习工具 | Web & Windows';
  const description = 'Kotobud 是一款专注高效的日语背词与复习工具（Japanese vocabulary learning and review app）。内置《新版中日交流标准日本语》初级、中级、高级全六册官方词书与现代 FSRS 智能间隔重复算法，支持假名、汉字、听音自适应测验、生词本管理与多端云同步。支持浏览器在线使用与 Windows 桌面客户端。';
  const canonicalUrl = `${DOMAIN}/`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${DOMAIN}/#software`,
        "name": "Kotobud",
        "alternateName": ["Kotobud 日语背词软件", "Kotobud App"],
        "url": DOMAIN,
        "applicationCategory": "EducationalApplication",
        "applicationSubCategory": "Language Learning Application",
        "operatingSystem": "Windows 10, Windows 11, Web Browser",
        "softwareVersion": `Web ${RELEASE_VERSION}; Windows ${WINDOWS_DOWNLOAD_VERSION}`,
        "description": description,
        "downloadUrl": `${DOMAIN}/download`,
        "image": `${DOMAIN}/brand/kotobud-icon-512.png`,
        "browserRequirements": "Requires JavaScript. Requires HTML5.",
        "featureList": [
          "新版中日交流标准日本语初中高全六册词书",
          "FSRS 现代科学间隔重复复习调度算法",
          "假名、汉字、中文释义与真人口播多模式测验",
          "易混淆与顽固生词专属收藏本攻坚",
          "Local-First 本地优先架构与断网无忧学习",
          "Cloudflare D1 跨端增量数据云同步",
          "提供 Web 浏览器免安装版与 Windows 桌面客户端"
        ],
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "CNY"
        }
      },
      {
        "@type": "Organization",
        "@id": `${DOMAIN}/#organization`,
        "name": "Kotobud",
        "url": DOMAIN,
        "logo": `${DOMAIN}/brand/kotobud-icon-512.png`,
        "description": "Kotobud 官方开发团队，致力于打造专注自律、干净纯粹的现代化日语背词与科学复习工具。",
        "sameAs": [
          "https://github.com/lil-Detoxify/kotoba"
        ]
      },
      {
        "@type": "WebSite",
        "@id": `${DOMAIN}/#website`,
        "name": "Kotobud",
        "alternateName": [
          "kotobud.com",
          "Kotobud 日语",
          "Kotobud 日语背词",
          "Kotobud Japanese Vocabulary"
        ],
        "url": DOMAIN,
        "inLanguage": "zh-CN",
        "description": "Kotobud 官方网站，提供新版标准日本语全六册课次词书与科学 FSRS 间隔复习背词工具。",
        "publisher": { "@id": `${DOMAIN}/#organization` }
      }
    ]
  };

  const bodyContent = renderLandingContent(RELEASE_VERSION, WINDOWS_DOWNLOAD_VERSION);

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/',
    jsonLd,
    bodyContent,
    headExtra: landingHead,
    bodyClass: 'landing-page'
  });
}

// 2. Features Page
function generateFeaturesPage() {
  const title = 'Kotobud 功能介绍 – 日语单词学习与 FSRS 科学复习特性';
  const description = '深入了解 Kotobud 的功能特性：新版中日交流标准日本语初中高全六册课次词书、FSRS 科学间隔重复复习算法、假名汉字听音多维度测验、生词本集中攻坚与多端云同步。';
  const canonicalUrl = `${DOMAIN}/features`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${DOMAIN}/features#webpage`,
        "name": title,
        "url": canonicalUrl,
        "description": description,
        "isPartOf": { "@type": "WebSite", "@id": `${DOMAIN}/#website`, "name": "Kotobud", "url": DOMAIN }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${DOMAIN}/features#breadcrumb`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "首页",
            "item": `${DOMAIN}/`
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "功能特性",
            "item": canonicalUrl
          }
        ]
      }
    ]
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">深入了解产品</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">Kotobud 核心功能特性：日语背词与科学记忆体系</h1>
        <p>为日语自学者与考级读者量身定制的课次规划、记忆算法与测试闭环</p>
      </div>

      <div class="article-body">
        <h2>1. 标日初中高六册官方全覆盖</h2>
        <p>
          很多背词工具的词书结构杂乱无章，脱离教材语境。Kotobud 与经典教材《新版中日交流标准日本语》完全同步，按照册别、单元和课次严格整理归类：
        </p>
        <ul>
          <li><strong>初级上册（第1课–第24课）</strong>：涵盖生活常用词汇、动词三类分类基础、形容词接续、五十音日常高频场景。</li>
          <li><strong>初级下册（第25课–第48课）</strong>：涵盖动词敬体简体、假定形、授受动词、使役被动等中级衔接必备词汇。</li>
          <li><strong>中级上/下册</strong>：篇章阅读核心词、长难复合动词、副词固定搭配，对应 JLPT N3/N2 水平。</li>
          <li><strong>高级上/下册</strong>：涵盖新闻政经、文学评论、职场敬语高级表达，直通 JLPT N1。</li>
        </ul>
        <p style="margin-top: 10px;">
          想了解如何在各阶段制定科学学习进度？请参阅 <a href="/guide" style="color: var(--green); text-decoration: underline; font-weight: 600;">Kotobud 标日六册教材背词学习规划指南 →</a>。
        </p>

        <h2>2. FSRS 智能间隔重复算法</h2>
        <p>
          Kotobud 舍弃了上世纪 80 年代的简单 SM-2 算法，全面应用当前记忆科学领域领先的 <strong>FSRS (Free Spaced Repetition Scheduler)</strong> 算法。
        </p>
        <p>
          FSRS 基于遗忘曲线的状态空间模型，能够同时建模三个核心变量：
        </p>
        <ul>
          <li><strong>稳定性 (Stability, S)</strong>：当记忆可提取性下降到 90% 时所需的时间间隔（天数）。每次成功复习后，稳定性都会呈指数级上升。</li>
          <li><strong>难度 (Difficulty, D)</strong>：单词对你个人的主观记忆阻力。难词会得到更密集的巩固排期，简单词则快速推迟复习。</li>
          <li><strong>可提取性 (Retrievability, R)</strong>：当前时刻你在无提示下成功回忆起该单词的概率。</li>
        </ul>
        <div class="quote-block">
          通过针对每个单词打分（Again 重来、Hard 困难、Good 良好），系统动态校准你的个人遗忘参数，将每天无效的重复复习时间缩短 30% 以上。详细评分准则参见 <a href="/guide#fsrs" style="color: var(--green); text-decoration: underline; font-weight: 600;">FSRS 算法三档打分详解 →</a>。
        </div>

        <h2>3. 假名、汉字与听音多维度测验</h2>
        <p>
          日语单词学习的独特难点在于“形、音、义”的分离——汉字有音读与训读，假名有长音促音促发。Kotobud 提供了复合测验流：
        </p>
        <ul>
          <li><strong>看汉字选读音</strong>：考查对汉字在具体单词中音训读音的辨识能力。</li>
          <li><strong>看假名/读音选释义</strong>：考查脱离汉字提示时的纯听感与假名对应释义。</li>
          <li><strong>真人高清听音测试</strong>：播放官方发音，闭眼盲听选意，彻底打通听力输入通道。</li>
          <li><strong>自评主动回忆卡片</strong>：卡片翻转模式，先在大脑中主动检索拼写与中文，再翻面核对自评。</li>
        </ul>

        <h2>4. 专属生词本与复习清单</h2>
        <p>
          背词过程中遇到特别顽固、多次遗忘的词汇？一键点亮星标收藏至生词本。你可以在生词本中进行针对性单练，攻克之后再一键移出。建议配合 <a href="/guide#habits" style="color: var(--green); text-decoration: underline; font-weight: 600;">高效背词习惯法 →</a> 每日少量高频集中清理。
        </p>

        <h2>5. 本地优先（Local-First）与多端数据安全</h2>
        <p>
          Kotobud 的底层架构设计坚持“本地优先”原则：
        </p>
        <ul>
          <li>学习记录和进度第一时间保存在设备本地（IndexedDB），断网环境下体验丝滑顺畅。</li>
          <li>登录账号后，本地数据通过 Cloudflare D1 数据库执行增量同步，采用最后写入者胜（LWW）与冲突防御算法，确保学习数据零丢失。</li>
          <li>提供纯正 Windows 桌面端（Electron 原生沙箱），免受网页浏览器标签页误关困扰。支持在 <a href="/download" style="color: var(--green); text-decoration: underline; font-weight: 600;">Windows 客户端下载页 →</a> 获取免安装便携版。</li>
        </ul>
      </div>

      <div style="text-align: center; margin-bottom: 60px; display: flex; justify-content: center; gap: 14px; flex-wrap: wrap;">
        <a href="/app/" class="btn btn-primary btn-lg">进入 Kotobud 在线学习</a>
        <a href="/download" class="btn btn-lg">下载 Windows v${WINDOWS_DOWNLOAD_VERSION} 客户端</a>
        <a href="/guide" class="btn btn-lg">查看使用指南</a>
      </div>
    </div>
  `;

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/features',
    jsonLd,
    bodyContent
  });
}

// 3. Download Page
function generateDownloadPage(extensionDownload) {
  const downloadsReady = process.env.VITE_WINDOWS_DOWNLOADS_READY === 'true';
  const title = '下载 Kotobud – Windows 客户端与浏览器扩展 | 小程序指引';
  const description = `下载 Kotobud Windows v${WINDOWS_DOWNLOAD_VERSION} 安装版、便携版与浏览器扩展手动安装测试包；使用 Web v${RELEASE_VERSION} 在线版，或查看微信小程序准备状态与使用指引。`;
  const canonicalUrl = `${DOMAIN}/download`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${DOMAIN}/download#software`,
        "name": "Kotobud Windows 桌面客户端",
        "url": canonicalUrl,
        "applicationCategory": "EducationalApplication",
        "applicationSubCategory": "Language Learning Application",
        "operatingSystem": "Windows 10, Windows 11 (64-bit)",
        "softwareVersion": WINDOWS_DOWNLOAD_VERSION,
        "description": description,
        "downloadUrl": downloadsReady ? `${DOMAIN}/downloads/${WINDOWS_SETUP_FILE}` : `${DOMAIN}/download`,
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "CNY"
        }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${DOMAIN}/download#breadcrumb`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "首页",
            "item": DOMAIN
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "客户端下载与平台指引",
            "item": `${DOMAIN}/download`
          }
        ]
      }
    ]
  };

  const bodyContent = renderDownloadContent({
    webVersion: RELEASE_VERSION,
    windowsVersion: WINDOWS_DOWNLOAD_VERSION,
    setupFile: WINDOWS_SETUP_FILE,
    portableFile: WINDOWS_PORTABLE_FILE,
    checksumFile: WINDOWS_CHECKSUM_FILE,
    downloadsReady,
    extensionDownload
  });

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/download',
    jsonLd,
    bodyContent,
    bodyClass: 'download-page',
    headExtra: `<style>${downloadStyles}</style>`
  });
}

// 4. About Page
function generateAboutPage() {
  const title = '关于 Kotobud – 日语词汇学习工具的产品初心与品牌介绍';
  const description = '了解 Kotobud 的初心与产品故事：为什么做一款没有广告与弹窗骚扰的纯粹日语背词工具，从代码名 Kotoba 到正式品牌 Kotobud 的演化含义，词库来源与开源辞书协议声明（JMdict / EDICT / Kanjidic）。';
  const canonicalUrl = `${DOMAIN}/about`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${DOMAIN}/about#webpage`,
        "name": title,
        "url": canonicalUrl,
        "description": description,
        "isPartOf": { "@type": "WebSite", "@id": `${DOMAIN}/#website`, "name": "Kotobud", "url": DOMAIN }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${DOMAIN}/about#breadcrumb`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "首页",
            "item": `${DOMAIN}/`
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "关于产品",
            "item": canonicalUrl
          }
        ]
      }
    ]
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">产品初心与故事</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">关于 Kotobud：打造纯粹克制的日语学习手帖</h1>
        <p>厌倦了浮躁的社交打卡与算法推荐，重回安安静静背单词的本质</p>
      </div>

      <div class="article-body">
        <h2>做这款工具的初衷</h2>
        <p>
          相信每一位学习日语的朋友，手机里都曾下载过几个知名背词 App。但不知从什么时候开始，背词工具变得越来越臃肿：
        </p>
        <ul>
          <li>打开应用，先看 5 秒开屏广告与会员优惠弹窗；</li>
          <li>背完一组词，强制弹出打卡海报让你分享到朋友圈；</li>
          <li>各种虚拟金币、宠物养成、PK 排行榜分散了本就不多的注意力；</li>
          <li>单词排期死板，已经背烂了的单词依然机械重复，真正记不住的生词却匆匆划过。</li>
        </ul>
        <p>
          我们希望有一款工具，它就像一本纸质的日语学习手帖：<strong>干净、纯粹、温润，打开就背，背完就走，不打扰，但足够高效。</strong>
        </p>
        <p>
          于是有了 Kotobud。它全面融合了 <a href="/features" style="color: var(--green); text-decoration: underline;">《新标日》全六册课次词书与 FSRS 记忆算法</a>，支持离线背词与多端云同步。
        </p>

        <h2 id="brand">品牌名称的演进：从 Kotoba 到 Kotobud</h2>
        <p>
          在项目最初立项与技术原型阶段，内部使用代码名 <code>Kotoba</code>（源自日文“言葉 / ことば”，意为“语言、词汇”）。
        </p>
        <p>
          随着产品进入正式开发、引入标日全套课次词书与 FSRS 记忆算法，我们正式将产品命名确立为 <strong>Kotobud</strong>。
        </p>
        <p>
          <strong>Kotobud = Kotoba (言葉) + Bud (萌芽)</strong>。寓意着学习日语的过程就如同一颗颗种子在心中发芽。只要每天认识一点点，假以时日，词汇之树终将枝繁叶茂。
        </p>

        <h2 id="license">开源辞书与数据协议致谢</h2>
        <p>
          Kotobud 的高品质日语释义、例句与音调扩展，离不开全球开源日语计算语言学社区数十年的无私奉献。在此郑重声明并感谢：
        </p>
        <ul>
          <li>
            <strong>JMdict / EDICT</strong>：由澳大利亚国立大学 Jim Breen 教授及 The Electronic Dictionary Research and Development Group (EDRDG) 主持编纂的开源日汉/日英辞书项目。数据根据其开源许可协议使用。
          </li>
          <li>
            <strong>KANJIDIC</strong>：日本汉字音训读音、部首及释义数据库。
          </li>
          <li>
            <strong>《新版中日交流标准日本语》</strong>：词汇索引与课次目录整理仅作为日语自学学习辅助与教育研讨用途，版权归原出版社及著作权人所有。
          </li>
          <li>
            <strong>开源协议声明</strong>：Kotobud 严格遵守开源辞书的署名与使用规范，不滥用、不恶意闭源封锁基础语言词条数据。
          </li>
        </ul>

        <h2>产品设计理念</h2>
        <ul>
          <li><strong>用户隐私第一</strong>：除云同步必需的账号标识外，不收集任何不必要的用户隐私数据。</li>
          <li><strong>本地优先 (Local-First)</strong>：数据始终优先留在你的电脑与浏览器本地。即便没有网络，你随时随地都是词书的主人。</li>
          <li><strong>坚持科学方法</strong>：持续追踪前沿间隔重复调度算法（如 FSRS），以科学的力量对抗人类大脑的自然遗忘。</li>
        </ul>
      </div>

      <div style="text-align: center; margin-bottom: 60px; display: flex; justify-content: center; gap: 14px; flex-wrap: wrap;">
        <a href="/app/" class="btn btn-primary btn-lg">进入 Kotobud 在线学习</a>
        <a href="/features" class="btn btn-lg">查看功能特性</a>
        <a href="/download" class="btn btn-lg">下载客户端</a>
        <a href="/guide" class="btn btn-lg">查看学习指南</a>
      </div>
    </div>
  `;

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/about',
    jsonLd,
    bodyContent
  });
}

// 5. Guide Page
function generateGuidePage() {
  const title = 'Kotobud 使用指南 – 背词复习、浏览器扩展安装与小程序指引';
  const description = 'Kotobud 日语背词指南：教材规划与 FSRS 复习方法、浏览器扩展手动安装与保留进度升级，以及微信小程序准备状态和使用步骤。';
  const canonicalUrl = `${DOMAIN}/guide`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        "@id": `${DOMAIN}/guide#howto`,
        "name": title,
        "description": description,
        "url": canonicalUrl
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${DOMAIN}/guide#breadcrumb`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "首页",
            "item": `${DOMAIN}/`
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "使用指南",
            "item": canonicalUrl
          }
        ]
      }
    ]
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">学习指南与方法论</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">Kotobud 日语背词使用指南：教材规划与 FSRS 记忆法</h1>
        <p>掌握正确的单词记忆法则与 FSRS 算法配合技巧，事半功倍学日语</p>
      </div>

      <div class="article-body">
        <h2>一、标日教材的阶段规划建议</h2>
        <p>
          《新版中日交流标准日本语》是目前国内最系统、最贴近实际生活对话的经典教材。结合 Kotobud 的课次词书，推荐如下复习节奏：
        </p>
        <ul>
          <li>
            <strong>第一阶段：初级上册（第1课至第24课，目标 N5）</strong><br>
            重点掌握五十音图对应的假名拼写，弄清动词三类分类（一类五段动词、二类一段动词、三类カ变サ变）。每学完一课教材，在 Kotobud 选中对应课次进行两轮听音与汉字测试，直到生词全部消除。
          </li>
          <li>
            <strong>第二阶段：初级下册（第25课至第48课，目标 N4）</strong><br>
            初级下册语法密集（て形、た形、ない形、ば形变形）。单词背诵时必须结合词性与词尾变形规律记忆，多利用 Kotobud 提供的发音例句在大脑中形成语感。
          </li>
          <li>
            <strong>第三阶段：中级上下册（共32课，目标 N3–N2）</strong><br>
            从对话走向篇章阅读。这一阶段词汇量明显跃升，遇到生僻汉字与相似副词（如「すっかり」「ぴったり」「しっかり」），善用生词本集中归类记忆。
          </li>
          <li>
            <strong>第四阶段：高级上下册（共24课，目标 N1）</strong><br>
            攻克抽象思辨、学术评论与政经用词。重点关注四字熟语与敬语高频词。
          </li>
        </ul>
        <p style="margin-top: 12px;">
          想了解各册教材在软件中的收录分布？请查看 <a href="/features" style="color: var(--green); text-decoration: underline; font-weight: 600;">Kotobud 标日词库与核心功能特性 →</a>。
        </p>

        <h2 id="fsrs">二、FSRS 算法复习评分标准详解</h2>
        <p>
          Kotobud 在单词测验复习阶段提供三档反馈按钮。很多初学者不知道什么时候选 Hard、什么时候选 Good。请参考以下科学准则：
        </p>
        <div class="grid-3" style="margin: 20px 0;">
          <div class="card" style="background: #fdf5f2; border-color: #ebdcd6;">
            <h3 style="color: #a4453a;">1. Again (重来)</h3>
            <p><strong>标准：</strong>完全想不起来，或者在心中回忆的读音/词义与答案完全相反。</p>
            <p style="font-size: 12px; color: var(--text-light); margin-top: 8px;">系统会将其标记为遗忘，并在本次学习会话结束前再次安排测试，同时降低该单词的记忆稳定性。</p>
          </div>
          <div class="card" style="background: #fdfbf1; border-color: #e9e5d4;">
            <h3 style="color: #8c7324;">2. Hard (困难)</h3>
            <p><strong>标准：</strong>经过了较长时间的犹豫（超过 5 秒）才艰难回忆出来，或者读音模棱两可。</p>
            <p style="font-size: 12px; color: var(--text-light); margin-top: 8px;">系统会认可你的回忆成功，但会轻微增加复习密度，缩短下一次出现的天数间隔。</p>
          </div>
          <div class="card" style="background: #f3f7ef; border-color: #d7e4cf;">
            <h3 style="color: var(--green);">3. Good (良好)</h3>
            <p><strong>标准：</strong>在 2–3 秒内顺畅无阻地回忆出假名、汉字和主要含义。</p>
            <p style="font-size: 12px; color: var(--text-light); margin-top: 8px;">FSRS 会按照标准的科学遗忘模型，将下次复习时间推迟到最适宜的未来时刻。</p>
          </div>
        </div>

        <h2 id="habits">三、高效背词习惯：少量、高频、连续</h2>
        <p>
          根据认知心理学研究，人类大脑在短期内大量灌输单词的效果极差（90% 都会在 48 小时后遗忘）。
        </p>
        <ul>
          <li><strong>每天 15 分钟 > 周末突击 2 小时</strong>：每天清空当日到期的 FSRS 复习队列，形成稳定的神经元强化通道。</li>
          <li><strong>一定要读出声来</strong>：在自测时跟随发音音频轻声朗读，口肌记忆加听力反馈能够成倍加深印象。</li>
          <li><strong>利用碎片时间</strong>：在通勤地铁、排队或睡前，掏出手机打开 Kotobud 网页版，随手复习 10 个到期词条。</li>
        </ul>

        <h2 id="sync">四、多端学习与数据同步技巧</h2>
        <p>
          在公司或自习室，打开 <a href="/download" style="color: var(--green); text-decoration: underline;">Windows 桌面客户端</a> 专心复习；在通勤途中或床上，用手机 Safari/Chrome 登录同个账号。只要网络畅通，学习事件会在后台静默完成同步。
        </p>

        <h2 id="extension">五、浏览器扩展：安装与升级</h2>
        <p><strong>当前为 v0.2.3 手动安装测试版，尚未上架 Chrome / Edge 扩展商店。</strong>Edge 已完成隔离环境测试；Chrome、原用户配置升级及真实账号跨端使用仍需进一步验收。请从 <a href="/download#extension" style="color: var(--green); text-decoration: underline;">官网下载页</a> 获取 ZIP 和 SHA-256 校验码，包内附有安装说明与词库来源资料。</p>
        <ol class="platform-steps">
          <li>将 ZIP 解压到一个长期保留的文件夹，确认其中直接包含 <code>manifest.json</code>。不要从压缩包里直接运行。</li>
          <li>在桌面版 Edge 地址栏输入 <code>edge://extensions</code>，或在 Chrome 输入 <code>chrome://extensions</code>，打开扩展管理页。</li>
          <li>开启“开发者模式”，选择“加载解压缩的扩展”（Chrome 为“加载已解压的扩展程序”），选择包含 <code>manifest.json</code> 的文件夹。</li>
          <li>点击 KotoBud 扩展图标打开侧边栏，在“今日 / 词书 / 生词本 / 统计”间切换；查词可在侧栏输入词头、读音或中文。普通网页选词后也可尝试右键“用 KotoBud 查词”；受保护页面使用侧栏输入。</li>
        </ol>
        <p><strong>更新现有扩展：</strong>先按需导出备份，再把新包内容覆盖到原安装文件夹，在扩展管理页对原扩展点击“重新加载”。保留原目录与扩展 ID，不卸载、不清除扩展存储，也不要另建安装实例，以保留旧词书、收藏与学习记录。</p>
        <p>学习记录默认存于本机；需要跨端时，在设置里使用现有邮箱账号开启同步。下载包不包含大批音频文件，发音联网按需加载。JLPT 等级词表来自社区整理，属于备考参考；来源与许可说明见包内 <code>DATA-SOURCES.txt</code>。</p>

        <h2 id="miniprogram">六、微信小程序：当前状态与使用指引</h2>
        <p><strong>v0.7.4 为本地候选，尚未上传、提审或正式发布。</strong>目前没有面向公众的体验二维码或可确认的微信搜索入口。开放体验后，本页与下载页会补充入口；现在可以在手机浏览器使用 <a href="/app/" style="color: var(--green); text-decoration: underline;">Web 在线版</a>。</p>
        <h3>开放体验后，怎样开始学习？</h3>
        <ol class="platform-steps">
          <li>收到项目方提供的有效体验入口后，在微信中打开；先阅读隐私说明并选择是否同意，确认后进入首页。</li>
          <li>在“教材”页选择新版标准日本语或 JLPT N5–N1 词书，再选择课次或词汇组开始学习；每天从首页或复习入口处理到期词。</li>
          <li>在学习页使用翻卡或测验模式，听发音后评分；“上一个”用于查看本轮已学词，不额外写入评分。发音声线和慢速播放可按个人需要设置。</li>
          <li>在学习统计里查看近 7 / 30 天的趋势、评价次数与词书占比；记忆阶段跟随当前词书，其余词书按需展开。</li>
          <li>需要账号同步时使用邮箱登录同一个 KotoBud 账号，等待同步成功后核对学习记录。微信快捷登录仍未开放；勿通过清缓存或重新安装来解决同步等待。</li>
        </ol>
        <details class="platform-testing"><summary>已受邀参与内部测试？</summary><p>当前需由项目方提供构建或体验入口，并完成微信开发者工具与真机验收；本地构建成功不代表微信审核通过。测试时核对网络与首次发音、选书 / 选课、评分后重开进度、账号切换及同步。公众无需安装开发者工具，等体验入口开放即可。</p></details>
      </div>

      <div style="text-align: center; margin-bottom: 60px; display: flex; justify-content: center; gap: 14px; flex-wrap: wrap;">
        <a href="/app/" class="btn btn-primary btn-lg">现在开始今日复习</a>
        <a href="/features" class="btn btn-lg">深入了解功能特性</a>
        <a href="/download" class="btn btn-lg">下载 Windows v${WINDOWS_DOWNLOAD_VERSION} 客户端</a>
      </div>
    </div>
  `;

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/guide',
    jsonLd,
    bodyContent
  });
}

// 6. Changelog Page
function generateChangelogPage() {
  const title = 'Kotobud 更新日志 – 版本演进与新特性记录';
  const description = `分别查看 Kotobud Web v${RELEASE_VERSION}、Windows v${WINDOWS_DOWNLOAD_VERSION}、小程序候选和浏览器扩展测试版的更新记录、发布状态与使用入口。`;
  const canonicalUrl = `${DOMAIN}/changelog`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${DOMAIN}/changelog#webpage`,
        "name": title,
        "url": canonicalUrl,
        "description": description,
        "isPartOf": { "@type": "WebSite", "@id": `${DOMAIN}/#website`, "name": "Kotobud", "url": DOMAIN }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${DOMAIN}/changelog#breadcrumb`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "首页",
            "item": `${DOMAIN}/`
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "更新日志",
            "item": canonicalUrl
          }
        ]
      }
    ]
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">版本演进历程</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">Kotobud 版本更新日志与迭代历程</h1>
        <p>各端独立记录版本与状态，正式发布、手动安装测试版和开发候选分别标注。</p>
        <nav class="platform-log-nav" aria-label="按平台查看更新"><a href="#web">Web</a><a href="#windows">Windows</a><a href="#miniprogram">微信小程序</a><a href="#extension">浏览器扩展</a><a href="#history">历史版本</a></nav>
      </div>

      <div class="article-body">
        <section class="version-item" aria-labelledby="web">
          <h2 id="web">Web 在线版</h2>
          ${recentWebReleaseNotes}
          <div class="version-header"><span class="version-tag">v0.9.0</span><span class="version-date">2026 年 10 月 13 日 · 已发布</span></div>
          <p><strong>从不同释义里看清一个词</strong></p>
          <ul>
            <li>词卡和查词结果加入词典对照，分别查看 Tomoshi 中文译释、JMdict 英文原义及日语版维基词典的日文解释与用例。</li>
            <li>各来源独立载入、折叠和重试，标明词形、读音或原形匹配，读音未核对时清楚说明。</li>
            <li>可在设置或对照侧栏选择首选来源、隐藏来源和调整顺序，偏好保存在本机。</li>
            <li>桌面用侧栏、手机用整屏查看，关闭后继续原来的学习。查询按需加载，不改变复习进度。</li>
            <li>常用用法对照扩展至30组，加入24个常用动词的四形练习、96条例句，以及六个场景的连续回应任务。</li>
            <li>设置提供个人词库手动账号备份，同账号另一设备可先预览再合并；学习记录沿用原有账户同步。</li>
          </ul>
          <div class="version-header"><span class="version-tag">v0.9.0-beta.2</span><span class="version-date">2026 年 10 月 12 日 · 测试记录，已并入0.9.0</span></div>
          <p><strong>让词语变成更自然的表达</strong></p>
          <ul>
            <li>常用搭配与易混用法扩展到 30 组对照，补充初级常用动词、数量表达、频率和语气说明。</li>
            <li>新增动词活用：24 个常用动词，练习ます形、て形、た形和ない形，支持假名或汉字假名输入，核对后展示规则、例句并可重练错题。</li>
            <li>六个生活场景各加入四步连续回应任务，选择后确认、查看原因，再接下一句；完成后可以重练错步。</li>
            <li>词书页和相关词卡提供活用入口。新练习沿用提示音设置，单独练习用法，不改变词书复习进度。</li>
          </ul>
          <div class="version-header"><span class="version-tag">v0.9.0-beta.1</span><span class="version-date">2026 年 10 月 12 日 · 测试记录，已并入0.9.0</span></div>
          <p><strong>把自己的词库带到另一台设备</strong></p>
          <ul>
            <li>设置中新增个人词库账号备份，手动保存自建词书、例句、笔记和收藏原句。</li>
            <li>另一台设备登录同一账号后，可先预览备份再合并。默认保留本机已有内容，也可选择使用账号备份。</li>
            <li>保存前查看备份摘要；账号备份发生变化时需重新查看。个人词库由手动备份管理，学习记录继续使用原有账户同步。</li>
          </ul>
          <div class="version-header"><span class="version-tag">v0.8.0</span><span class="version-date">2026 年 10 月 12 日 · 已发布</span></div>
          <p><strong>从记住单词，到在生活里用起来</strong></p>
          <ul>
            <li>新增假名键入和听写，支持平假名、片假名及全半角输入，先对照答案再保存本次答题。</li>
            <li>查词扩展到通用词典，可查词库之外的日语词，展开更多义项并收藏为个人词条。</li>
            <li>生活场景扩展为购物、点餐、问路、住宿、约见与天气六个专题，配有48个场景词、短对话和12条表达小贴士。词书页提供明确的场景学习入口。</li>
            <li>补齐标日六册9,117个词位置的例句填空，优化中文释义展示；新增搭配与易混用法对照，累计12组。</li>
            <li>答题加入木芽、风铃、林木、溪石四种轻声提示，可选择音色、调整音量、关闭提示音，并分别试听答对与答错的声音。</li>
            <li>每本词书可按半课或一课安排每日进度，首页可选择显示今日待学、待复习或词书进度，选课入口更清晰。</li>
            <li>个人词书支持逐词编辑、表格粘贴和文件导入，收藏原句与笔记可随个人词库文件手动迁移。</li>
            <li>统计按题型展示答题表现，可集中重练待巩固的词；完成页整理本轮新学与温习收获。统一“言 × 芽”品牌与页面细节。</li>
          </ul>
          <p><strong>2026 年 10 月 7 日 · Web v0.7.4</strong></p>
          <div class="version-header"><span class="version-tag">v0.7.4</span><span class="version-date">2026 年 10 月 7 日 · 已发布</span></div>
          <p><strong>首页准确续学与统一封面</strong></p>
          <ul>
            <li>首页“继续学习”直接接续本机上次未完成的词、学习范围、模式和练习方式，刷新后仍可继续；下方“继续你的词书”保留手动选课入口。</li>
            <li>首页词书卡与词书列表使用相同的个性化封面，优化小尺寸文字与插画排版；首页进度限定当前词书。</li>
            <li>保留旧词条、评分与学习记录。旧版首次续学按最近课次的可学词开始；新会话保存本机词级位置，完整会话位置不跨设备同步。</li>
          </ul>
          <p><strong>2026 年 10 月 6 日 · 词书、发音与学习统计更新</strong></p>
          <ul>
            <li>新增 JLPT N5–N1 五本社区等级词书，共 7,809 词；与原六册教材一起按“教材 / JLPT / 我的词书”分类，保留原词书及独立学习进度。</li>
            <li>补齐新增词的女声 / 男声发音，支持慢速与失败回退，并标明实际播放来源。</li>
            <li>教材使用完整书名，词书封面按标题与内容主题区分；鼠标悬浮与键盘聚焦提供反馈，支持减少动态效果。</li>
            <li>学习页增加只读“上一个”回看；新增按词头、读音与中文查词并加入生词本。</li>
            <li>统计显示 7 / 30 日折线图、评价次数条形图及各词书学习占比环形饼图。记忆阶段跟随当前词书，当前书课次默认展开，其余收进抽屉。</li>
          </ul>
        </section>
        <section class="version-item" aria-labelledby="windows">
          <h2 id="windows">Windows 桌面版</h2>
          ${currentWindowsReleaseNotes}
          <div class="version-header"><span class="version-tag">v0.9.0-beta.2</span><span class="version-date">2026 年 10 月 21 日 · 历史官网下载版本</span></div>
          <ul><li>安装版与便携版同步 Web 0.9.0 的每日学习计划、场景学习、动词活用、个人词库、提示音与学习统计。</li><li>支持假名键入、听写及多词典对照；教材词典与日文维基词典随安装包提供，可在本地查阅。</li><li>保留原有用户数据目录与账号同步方式，提供 Windows x64 安装版、免安装便携版和 SHA-256 校验清单。</li></ul>
          <p><a href="/download">下载 Windows 客户端 ↗</a></p>
          <p><strong>历史版本 · v0.7.3（2026 年 9 月 30 日）</strong></p>
          <p>官网、页面切换、学习卡片和设置反馈优化，支持系统减少动态效果。</p>
        </section>
        <section class="version-item" aria-labelledby="miniprogram">
          <h2 id="miniprogram">微信小程序</h2>
          <div class="version-header"><span class="version-tag">v0.7.4 候选</span><span class="version-date">2026 年 10 月 6 日 · 本地开发完成，待验收</span></div>
          <ul><li>接入六册教材与 JLPT 五册，共 11 本词书、16,926 词，采用完整书名、个性化封面及分类。</li><li>准备双声发音、慢速、只读上一词回看，以及 7 / 30 日折线、条形、环形饼图；当前词书进度与抽屉展示规则和 Web 接近。</li><li>保留原词条 ID、账号分区与学习记录，未迁移原数据。构建和自动化检查已完成，微信工具与真机仍待验收。</li><li>尚未上传、提审或发布，没有公众体验二维码；微信快捷登录仍未开放。</li></ul>
          <p><a href="/guide#miniprogram">查看小程序状态与使用指引 ↗</a></p>
        </section>
        <section class="version-item" aria-labelledby="extension">
          <h2 id="extension">浏览器扩展</h2>
          <div class="version-header"><span class="version-tag">v0.2.3 测试版</span><span class="version-date">2026 年 10 月 7 日 · 官网手动安装包</span></div>
          <p><strong>10 月 6 日候选功能，10 月 7 日开放官网下载</strong></p>
          <ul><li>底部统一为“今日 / 词书 / 生词本 / 统计”，使用完整书名和个性化封面；当前词书与续学更突出，窄侧栏布局接近 Web / 小程序。</li><li>加入 JLPT N5–N1 五册，与原六册合计 11 本词书、16,926 词；按需播放女声 / 男声发音，显示实际来源与失败回退。</li><li>学习页增加只读上一词回看；统计加入 7 / 30 日三类图表、当前书记忆阶段与其他词书抽屉，保留组合学习与导入。</li><li>修复新增词评分、后台消息及账号切换快照的兼容问题，保留原数据库、扩展存储与学习记录。</li><li>已在隔离 Edge 中验收；Chrome、原用户配置升级及真实账号跨端仍待检查。尚未上架扩展商店。</li></ul>
          <p><a href="/download#extension">下载测试版与安装说明 ↗</a></p>
        </section>
        <h2 id="history">历史版本</h2>
        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.7.3</span>
            <span class="badge-pill" style="margin: 0; padding: 2px 10px; font-size: 11px;">Web 与 Windows</span>
            <span class="version-date">2026 年 9 月 30 日</span>
          </div>
          <p><strong>Web v0.7.3 官网与下载体验更新：</strong></p>
          <ul>
            <li>官网介绍页保留绿色纸感与产品信息，加入随滚动展开的词卡、词书与学习方式演示；支持减少动态效果。</li>
            <li>日语词带改为无缝循环，补齐超宽屏内容，滚动时轻微加速，离屏与后台暂停。</li>
            <li>客户端下载页重做主次排版、单行按钮与常见问题展开，并纠正文件大小标注。</li>
            <li>设置页采用两列独立堆叠，让 Windows 下载卡片紧接宠物设置。</li>
            <li>Windows v0.7.3 安装版与便携版同步本轮页面、学习卡片和设置反馈优化，并提供 SHA-256 校验清单。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.7.2</span>
            <span class="badge-pill" style="margin: 0; padding: 2px 10px; font-size: 11px;">Web 在线版</span>
            <span class="version-date">2026 年 9 月 29 日</span>
          </div>
          <p><strong>Web v0.7.2 界面与交互反馈更新：</strong></p>
          <ul>
            <li>设置页更新分区布局；切换发音、宠物形象和陪伴方式时显示即时反馈。</li>
            <li>页面切换、按钮按压与学习答题结果增加更清晰的过渡；系统要求减少动态效果时尊重该设置。</li>
            <li>改善手机宽度下的设置页和导航布局。当次 Windows 安装包仍为 v0.7.1。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.7.1</span>
            <span class="version-date">2026 年 9 月 24 日</span>
          </div>
          <p><strong>Web 与 Windows v0.7.1 吉祥物显示修复：</strong></p>
          <ul>
            <li>修复 Web 端叶团猫动作切换时的游离像素，经典与像素形象改用完整的独立动作帧。</li>
            <li>修正 Web 设置页的宠物预览图；Windows v0.7.1 同步包含这些修复。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.7.0</span>
            <span class="version-date">2026 年 9 月</span>
          </div>
          <p><strong>学习陪伴与跨端体验更新：</strong></p>
          <ul>
            <li><strong>新增叶团猫宠物</strong>：提供经典与像素形象、低频动画、减少动态模式和本地偏好设置，可选择在学习时陪伴或自动隐藏。</li>
            <li><strong>学习过程轻互动</strong>：宠物根据答题、连续正确与完成状态作出轻微回应；学习页面可将宠物放在单词卡片右侧持续陪伴。</li>
            <li><strong>Windows 便携版体验更新</strong>：支持从应用内创建桌面快捷方式，统一 KotoBud 品牌标识。</li>
            <li><strong>设置与同步体验改进</strong>：集中管理发音、宠物与账户同步偏好，并加强页面错误恢复与跨端数据合并稳定性。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.6.1</span>
            <span class="version-date">2026 年 9 月</span>
          </div>
          <p><strong>Windows 桌面端专项优化、冷启动性能跃升与数据稳定性加固：</strong></p>
          <ul>
            <li><strong>便携版冷启动极致加速</strong>：重构应用启动与状态挂载流程，实现「本地优先立即挂载（Local-Hydrate First）+ 后台静默云对齐」。未登录游客模式零网络请求瞬间秒开，弱网或离线环境下启动耗时由数分钟直降至 ~1.3 秒。</li>
            <li><strong>便携版快捷方式支持</strong>：为 Windows 绿色便携版新增用户主动创建桌面快捷方式能力。通过安全系统 IPC 随时一键生成指向当前 Portable exe 的官方绿色「言」字图标快捷方式，保持免安装纯粹性的同时极大提升日常使用便利性。</li>
            <li><strong>安装版品牌深度收敛</strong>：修复二进制编译修补与 Windows AppUserModelID 标识，彻底清除旧版本 Kotoba 与 Electron 默认图标残留。桌面快捷方式、开始菜单、系统任务栏与安装/卸载程序全面统一定格为正式 KotoBud 品牌与绿色「言」字图标。</li>
            <li><strong>登录/同步后主页空白 Bug 根治</strong>：排查并修复切换已认证用户时词书加载缺失的分支时序（补全 <code>ensureBookLoaded</code>），增加并发切换互斥锁，并在 Vue 根节点与组件树增加全局容错与降级保护卡片，杜绝因极端异常导致的页面白屏。</li>
            <li><strong>跨端记录合并报错修复</strong>：规范网络层 AbortController 超时中断机制，将大载荷数据同步超时阈值由 10 秒放宽至 30 秒，彻底消除“signal is aborted without reason”报错并提供友好提示，多端学习记录安全合并零丢失。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.6.0</span>
            <span class="version-date">2026 年 9 月</span>
          </div>
          <p><strong>核心架构升级与多端云同步系统：</strong></p>
          <ul>
            <li><strong>全面升级 FSRS 记忆算法</strong>：引入最新一代 FSRS (Free Spaced Repetition Scheduler)，替代早期简易调度逻辑，复习周期更精准。</li>
            <li><strong>标日初中高全六册词库完整支持</strong>：支持初级上下、中级上下、高级上下全 104 课自由选课。</li>
            <li><strong>优化 R2 私有音视频资源分片代理</strong>：真人发音秒开播放，大幅降低边缘网络开销。</li>
            <li><strong>云同步多设备冲突防御</strong>：引入严格的时间戳校验与多设备数据合并保护机制，杜绝脏写与漏记。</li>
            <li><strong>移动端 Safari 触控手势优化</strong>：底栏自适应安全区，翻页与打分无任何横向晃动。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.5.0</span>
            <span class="version-date">2026 年 8 月</span>
          </div>
          <p><strong>测验模式与词典扩展：</strong></p>
          <ul>
            <li>新增“听音辨析”测验模式与真人口播支持。</li>
            <li>引入 JMdict / EDICT 开源权威汉日词典扩展，在单词详情中展示详尽释义与日语例句。</li>
            <li>新增生词本快捷星标功能，方便针对顽固生词集中攻坚。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.4.0</span>
            <span class="version-date">2026 年 7 月</span>
          </div>
          <p><strong>桌面端发布与云端同步支持：</strong></p>
          <ul>
            <li>推出 Kotobud Windows 桌面端（64位独立安装版与免安装便携版）。</li>
            <li>引入安全邮箱验证码注册与登录体系，接入 Cloudflare D1 云数据库支持跨端学习进度同步。</li>
            <li>增加每日学习统计、连续学习打卡追踪与柱状趋势图。</li>
          </ul>
        </div>

        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.1.0 – v0.3.0</span>
            <span class="version-date">2026 年前期</span>
          </div>
          <p><strong>项目立项与技术验证：</strong></p>
          <ul>
            <li>原型代码库 Kotoba 搭建，验证基于 IndexedDB 的 Local-First 单机日语背词可行性。</li>
            <li>完成标日初级上册词库提取与分课索引结构验证。</li>
            <li>确定安静、克制、茶绿配色的极简 UI 设计风格。</li>
          </ul>
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 60px; display: flex; justify-content: center; gap: 14px; flex-wrap: wrap;">
        <a href="/download" class="btn btn-primary btn-lg">下载当前 Windows v${WINDOWS_DOWNLOAD_VERSION} 客户端</a>
        <a href="/features" class="btn btn-lg">查看功能与算法特性</a>
        <a href="/about#brand" class="btn btn-lg">了解品牌演进</a>
        <a href="/app/" class="btn btn-lg">打开在线版</a>
      </div>
    </div>
  `;

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/changelog',
    jsonLd,
    bodyContent
  });
}

// 7. 404 Not Found Page
function generate404Page() {
  const title = '404 页面未找到 - Kotobud';
  const description = '抱歉，您访问的页面不存在或已被移除。请访问 Kotobud 首页或进入日语背词在线学习。';
  const canonicalUrl = `${DOMAIN}/404`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "description": description
  };

  const bodyContent = `
    <div class="container" style="padding: 100px 24px; text-align: center;">
      <img src="/brand/kotobud-mark.svg" alt="Kotobud" width="64" height="64" style="display: block; margin: 0 auto 24px;">
      <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 12px; color: var(--text-main);">404 - 页面未找到</h1>
      <p style="color: var(--text-muted); font-size: 16px; max-width: 520px; margin: 0 auto 36px;">
        抱歉，您访问的网址不存在、已被删除或发生了变动。您可以返回首页，或者直接进入在线背词手帖。
      </p>
      <div style="display: flex; justify-content: center; gap: 16px; flex-wrap: wrap;">
        <a href="/" class="btn btn-primary btn-lg">返回 Kotobud 官网首页</a>
        <a href="/app/" class="btn btn-lg">进入在线背词 (Web App)</a>
      </div>
    </div>
  `;

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '',
    jsonLd,
    bodyContent
  });
}

// Main execution function
function getLandingHead(targetDir) {
  const manifestPath = pathResolve(targetDir, '.vite/manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const landing = manifest['landing.html'];
    if (!landing?.file) throw new Error('The landing motion entry is missing from the Vite manifest.');
    return `${(landing.css ?? []).map(file => `<link rel="stylesheet" href="/${file}">`).join('\n')}\n<script type="module" src="/${landing.file}"></script>`;
  }
  // Standalone SEO generation still produces a styled, readable page without JS.
  const styles = readFileSync(pathResolve(import.meta.dirname, '../apps/web/src/landing.css'), 'utf8');
  return `<style>${styles}</style>`;
}

export function generateAllSeoPages(targetDir) {
  console.log(`Generating SEO static pages in: ${targetDir}`);
  mkdirSync(targetDir, { recursive: true });
  const extensionDownload = prepareExtensionDownload(targetDir);

  const pages = [
    { files: ['index.html'], content: generateHomePage(getLandingHead(targetDir)) },
    { files: ['features.html', 'features/index.html'], content: generateFeaturesPage() },
    { files: ['download.html', 'download/index.html'], content: generateDownloadPage(extensionDownload) },
    { files: ['about.html', 'about/index.html'], content: generateAboutPage() },
    { files: ['guide.html', 'guide/index.html'], content: generateGuidePage() },
    { files: ['changelog.html', 'changelog/index.html'], content: generateChangelogPage() },
    { files: ['404.html'], content: generate404Page() }
  ];

  for (const page of pages) {
    for (const file of page.files) {
      const fullPath = pathResolve(targetDir, file);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, page.content, 'utf-8');
      console.log(`  ✓ Created: ${file}`);
    }
  }

  // Also ensure IndexNow key file exists in targetDir
  const keyFile = pathResolve(targetDir, `${INDEXNOW_KEY}.txt`);
  writeFileSync(keyFile, `${INDEXNOW_KEY}\n`, 'utf-8');
  console.log(`  ✓ Created: ${INDEXNOW_KEY}.txt`);

  // Ensure Bing verification file exists in targetDir
  const bingFile = pathResolve(targetDir, 'BingSiteAuth.xml');
  const bingXml = `<?xml version="1.0"?>\n<users>\n\t<user>B54034535F2BC5D891C5E32773794D82</user>\n</users>\n`;
  writeFileSync(bingFile, bingXml, 'utf-8');
  console.log(`  ✓ Created: BingSiteAuth.xml`);
}

// Allow CLI execution: node scripts/generate-seo-pages.mjs [targetDir]
const targetArg = process.argv[2] || 'dist-cloudflare';
if (process.argv[1] && process.argv[1].endsWith('generate-seo-pages.mjs')) {
  generateAllSeoPages(pathResolve(process.cwd(), targetArg));
}
