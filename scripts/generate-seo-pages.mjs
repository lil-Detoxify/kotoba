import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';

const INDEXNOW_KEY = '4b68e91c784e4b5bb8972cae6c7104f2';
const DOMAIN = 'https://kotobud.com';

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
      .grid-3, .grid-2 { grid-template-columns: 1fr; }
      .article-body { padding: 28px 20px; }
      .footer-grid { grid-template-columns: 1fr; gap: 24px; }
      .footer-bottom { flex-direction: column; gap: 12px; text-align: center; }
      .feature-strip { gap: 16px; font-size: 12px; }
    }
  `;
}

function renderHeader(activePath = '/') {
  return `
    <header class="site-header">
      <div class="container nav-inner">
        <a href="/" class="brand-logo" title="Kotobud 日语背词与复习工具">
          <span class="brand-mark">言</span>
          <div>
            <span>Kotobud</span>
            <small>每天，认识一点日语。</small>
          </div>
        </a>
        <nav class="site-nav">
          <a href="/features" class="${activePath === '/features' ? 'active' : ''}">功能特性</a>
          <a href="/download" class="${activePath === '/download' ? 'active' : ''}">客户端下载</a>
          <a href="/guide" class="${activePath === '/guide' ? 'active' : ''}">学习指南</a>
          <a href="/about" class="${activePath === '/about' ? 'active' : ''}">关于产品</a>
          <a href="/changelog" class="${activePath === '/changelog' ? 'active' : ''}">更新日志</a>
        </nav>
        <div class="header-actions">
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
              <span class="brand-mark" style="width: 32px; height: 35px; font-size: 20px;">言</span>
              <span>Kotobud</span>
            </div>
            <p style="font-size: 13px; line-height: 1.7; max-width: 320px; margin-bottom: 14px;">
              每天，认识一点日语。Kotobud 是一款专注纯粹的单机日语学习手帖，内置新版标准日本语全六册词书与现代 FSRS 科学间隔重复复习算法。
            </p>
            <p style="font-size: 12px; color: var(--text-light);">
              ことばを、少しずつ。<br>持之以恒，终有回响。
            </p>
          </div>
          <div class="footer-col">
            <h4>产品与下载</h4>
            <ul>
              <li><a href="/app/">Web 在线学习版</a></li>
              <li><a href="/download">Windows 桌面端安装包</a></li>
              <li><a href="/download">Windows 绿色便携版</a></li>
              <li><a href="/features">词书与算法特性</a></li>
              <li><a href="/changelog">版本历史 (v0.6.0)</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>学习与指南</h4>
            <ul>
              <li><a href="/guide">标日六册学习路径</a></li>
              <li><a href="/guide#fsrs">FSRS 间隔复习打分法</a></li>
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
  headExtra = ''
}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#f7f8f4">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="Kotobud, 日语背词, 日语学习, 标日词汇, 标准日本语, FSRS, 日语单词, 日语复习, JLPT, 日语词典">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/png" href="/icon.png">
  <link rel="manifest" href="/manifest.json">
  <meta name="msvalidate.01" content="B54034535F2BC5D891C5E32773794D82">

  <!-- Open Graph / Social -->
  <meta property="og:site_name" content="Kotobud">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${DOMAIN}/icon.png">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${DOMAIN}/icon.png">

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>

  <style>
${getSharedStyles()}
  </style>
  ${headExtra}
</head>
<body>
  ${renderHeader(activePath)}
  <main>
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
      if (window.location.hash && window.location.hash.length > 1) {
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
function generateHomePage() {
  const title = 'Kotobud – 日语背词与复习工具 | Web & Windows';
  const description = 'Kotobud 是一款专注高效的日语背词与复习工具。内置《新版中日交流标准日本语》初级、中级、高级全六册官方词书与现代 FSRS 智能间隔重复算法，支持假名、汉字、听音自适应测验、生词本管理与多端云同步。支持浏览器在线使用与 Windows 桌面版。';
  const canonicalUrl = `${DOMAIN}/`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${DOMAIN}/#software`,
        "name": "Kotobud",
        "url": DOMAIN,
        "applicationCategory": "EducationalApplication",
        "operatingSystem": "Windows 10, Windows 11, Web Browser",
        "softwareVersion": "0.6.0",
        "description": description,
        "downloadUrl": `${DOMAIN}/download`,
        "image": `${DOMAIN}/icon.png`,
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
        "logo": `${DOMAIN}/icon.png`
      },
      {
        "@type": "WebSite",
        "@id": `${DOMAIN}/#website`,
        "name": "Kotobud",
        "url": DOMAIN,
        "publisher": { "@id": `${DOMAIN}/#organization` }
      }
    ]
  };

  const bodyContent = `
    <section class="hero-section">
      <div class="container">
        <div class="badge-pill">
          <span>🌿</span> 纯粹自律的日语背词与学习手帖 · 现已支持 Windows 桌面版
        </div>
        <h1 class="hero-title">Kotobud：日语背词与复习工具</h1>
        <p class="hero-desc">
          一词一句，慢慢积累。集成《新版中日交流标准日本语》初级、中级、高级全六册课次词书，结合最新 FSRS 科学间隔重复算法，帮助日语学习者建立扎实的词汇网络与听音记忆。
        </p>
        <div class="cta-group">
          <a href="/app/" class="btn btn-primary btn-lg" id="hero-primary-btn">
            <span>开始在线背词</span>
            <span style="font-size: 12px; opacity: 0.85;">Web 版免安装，即开即学</span>
          </a>
          <a href="/download" class="btn btn-lg">
            <span>💻 下载 Windows 客户端</span>
            <span style="font-size: 12px; color: var(--text-muted);">v0.6.0 64位</span>
          </a>
        </div>
        <div class="feature-strip">
          <span>✔ 标日全六册 10,000+ 词条</span>
          <span>✔ 新一代 FSRS 间隔重复算法</span>
          <span>✔ 假名 · 汉字 · 听音 多模式测验</span>
          <span>✔ 多端云同步 & 纯净无广告</span>
        </div>
      </div>
    </section>

    <section class="content-section">
      <div class="container">
        <div class="section-header">
          <h2>全套官方标日词书与科学记忆体系</h2>
          <p>从五十音到 N1 级别，为每一个课次定制高效的复习与检测路径</p>
        </div>
        <div class="grid-3">
          <div class="card">
            <div class="card-icon">📚</div>
            <h3>新标日全六册官方词书</h3>
            <p>
              完整收录《新版中日交流标准日本语》初级上/下册、中级上/下册、高级上/下册。词条按课次、单元科学归类，词性、音调、读音一应俱全。
            </p>
            <ul>
              <li>初级上下册：打牢 N5/N4 日常基础词汇</li>
              <li>中级上下册：攻克 N3/N2 进阶语法与阅读词</li>
              <li>高级上下册：冲刺 N1 商务、新闻与学术词汇</li>
            </ul>
          </div>
          <div class="card">
            <div class="card-icon">🧠</div>
            <h3>FSRS 智能间隔重复算法</h3>
            <p>
              告别死记硬背。内置最新一代 FSRS (Free Spaced Repetition Scheduler) 记忆调度算法，针对个人记忆遗忘曲线自适应预测下一次复习时机。
            </p>
            <ul>
              <li>精准度远超传统艾宾浩斯与 Anki SM-2</li>
              <li>Again (重来) / Hard (困难) / Good (良好) 三档评分</li>
              <li>大幅减少重复学习已掌握单词的疲劳感</li>
            </ul>
          </div>
          <div class="card">
            <div class="card-icon">🎧</div>
            <h3>多模式自适应测验</h3>
            <p>
              单词不仅要会认，更要能听懂、知读音。Kotobud 提供全方位的测验训练模式，彻底攻克“看得懂但听不出、会读但选不对”的学习痛点。
            </p>
            <ul>
              <li>汉字识别：看汉字写假名与词义</li>
              <li>听音辨析：真人发音听力抓词</li>
              <li>反向测试：看中文释义回忆日文拼写</li>
            </ul>
          </div>
          <div class="card">
            <div class="card-icon">⭐</div>
            <h3>生词本与薄弱项强化</h3>
            <p>
              随时将易混淆、难记的单词加入生词本。支持按难词标记、忽略熟悉词、错题重练等灵活筛选，让精力聚焦在提分刀刃上。
            </p>
          </div>
          <div class="card">
            <div class="card-icon">☁️</div>
            <h3>多端云同步与本地优先</h3>
            <p>
              采用 Local-First 本地优先架构，断网也能在离线状态下顺畅背词。联网后自动增量合并多设备学习进度，Web 端与桌面端无缝协同。
            </p>
          </div>
          <div class="card">
            <div class="card-icon">📖</div>
            <h3>权威词典扩展与例句</h3>
            <p>
              内置详尽的词典释义扩展、词性剖析与日汉对照例句，词汇放在真实语境中理解，知其然更知其所以然。
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="content-section" style="background: #edf2e8; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
      <div class="container">
        <div class="section-header">
          <h2>为什么坚持使用 Kotobud？</h2>
          <p>一份安静、克制、纯粹的日语学习手帖，尊重你的时间和注意力</p>
        </div>
        <div class="grid-3">
          <div class="card" style="background: var(--bg);">
            <h3>🚫 零广告，无弹窗骚扰</h3>
            <p>没有开屏推销、没有虚拟币充值、没有社交打卡分享捆绑。打开网页或应用，立刻进入沉浸式日语背词状态。</p>
          </div>
          <div class="card" style="background: var(--bg);">
            <h3>⚡ 极速轻巧，本地离线可用</h3>
            <p>依托现代轻量技术构建，无论是 Windows 桌面客户端还是网页端，启动迅速、内存占用极低，随时随地开启背词。</p>
          </div>
          <div class="card" style="background: var(--bg);">
            <h3>🎯 专注标准日本语教材</h3>
            <p>专为标日读者设计课次同步学习模式，课前预习生词、课后巩固测试，完美契合自学与各类日语培训班进度。</p>
          </div>
        </div>
      </div>
    </section>

    <section class="content-section">
      <div class="container">
        <div class="highlight-box">
          <div>
            <h3>准备好开始今日份的日语学习了吗？</h3>
            <p>无论你是刚刚掌握五十音图的新手，还是正在备战 JLPT N2/N1 的进阶者，Kotobud 都将成为你最长情的单词伙伴。</p>
          </div>
          <div style="display: flex; gap: 12px; flex-shrink: 0;">
            <a href="/app/" class="btn btn-primary btn-lg">进入在线背词</a>
            <a href="/download" class="btn btn-lg">下载客户端</a>
          </div>
        </div>
      </div>
    </section>
  `;

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/',
    jsonLd,
    bodyContent
  });
}

// 2. Features Page
function generateFeaturesPage() {
  const title = '功能特性 - Kotobud 日语背词与复习工具';
  const description = '深入了解 Kotobud 的功能特性：新版中日交流标准日本语初中高六册课次词书、FSRS 科学间隔重复复习算法、假名汉字听音多维度测验、生词本集中攻坚与多端云同步。';
  const canonicalUrl = `${DOMAIN}/features`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "url": canonicalUrl,
    "description": description,
    "isPartOf": { "@type": "WebSite", "name": "Kotobud", "url": DOMAIN }
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">深入了解产品</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">Kotobud 核心功能特性</h1>
        <p>为日语学习者量身定制的课次规划、记忆算法与测试闭环</p>
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
          通过针对每个单词打分（Again 重来、Hard 困难、Good 良好），系统动态校准你的个人遗忘参数，将每天无效的重复复习时间缩短 30% 以上。
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
          背词过程中遇到特别顽固、多次遗忘的词汇？一键点亮星标收藏至生词本。你可以在生词本中进行针对性单练，攻克之后再一键移出。
        </p>

        <h2>5. 本地优先（Local-First）与多端数据安全</h2>
        <p>
          Kotobud 的底层架构设计坚持“本地优先”原则：
        </p>
        <ul>
          <li>学习记录和进度第一时间保存在设备本地（IndexedDB），断网环境下体验丝滑顺畅。</li>
          <li>登录账号后，本地数据通过 Cloudflare D1 数据库执行增量同步，采用最后写入者胜（LWW）与冲突防御算法，确保学习数据零丢失。</li>
          <li>提供纯正 Windows 桌面端（Electron 原生沙箱），免受网页浏览器标签页误关困扰。</li>
        </ul>
      </div>

      <div style="text-align: center; margin-bottom: 60px;">
        <a href="/app/" class="btn btn-primary btn-lg">立即体验 Kotobud</a>
        <a href="/download" class="btn btn-lg" style="margin-left: 12px;">下载桌面端</a>
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
function generateDownloadPage() {
  const title = 'Windows 客户端与应用下载 - Kotobud';
  const description = '下载 Kotobud Windows 桌面版客户端（支持 Windows 10/11 64 位），提供安装版（Setup）与免安装绿色便携版（Portable）。无需复杂配置，解压即用，支持离线词书与多端云同步。也可以直接使用 Web 在线版。';
  const canonicalUrl = `${DOMAIN}/download`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Kotobud Windows 桌面端",
    "url": canonicalUrl,
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Windows 10, Windows 11 (64-bit)",
    "softwareVersion": "0.6.0",
    "description": description,
    "downloadUrl": `${DOMAIN}/downloads/Kotoba-0.6.0-Windows-x64-Setup.exe`,
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "CNY"
    }
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">官方下载通道</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">Kotobud 客户端与版本下载</h1>
        <p>无论在桌面端大屏专注背词，还是在浏览器随时随地学习，Kotobud 都能完美胜任</p>
      </div>

      <div class="grid-2" style="margin-bottom: 48px;">
        <div class="download-card">
          <div>
            <div class="card-icon" style="margin: 0 auto 18px;">💾</div>
            <h3>Windows 桌面端 (安装版)</h3>
            <p>推荐大多数 Windows 用户使用。自动创建桌面快捷方式，支持常规应用管理与升级。</p>
            <div style="background: var(--bg); padding: 14px; border-radius: 8px; margin-bottom: 20px; font-size: 12px; color: var(--text-muted); text-align: left;">
              <div><strong>版本号：</strong>v0.6.0 (x64)</div>
              <div><strong>系统要求：</strong>Windows 10 (1809+) / Windows 11</div>
              <div><strong>文件大小：</strong>约 70MB (离线辞书与资源按需云端缓存)</div>
            </div>
          </div>
          <a href="/downloads/Kotoba-0.6.0-Windows-x64-Setup.exe" class="btn btn-primary btn-lg" style="width: 100%;">
            ⬇️ 下载 Windows 安装版 (Setup.exe)
          </a>
        </div>

        <div class="download-card">
          <div>
            <div class="card-icon" style="margin: 0 auto 18px;">💼</div>
            <h3>Windows 绿色便携版 (Portable)</h3>
            <p>免安装版。解压即可直接运行，适合存放在 U 盘随身携带，或无管理员权限的办公电脑。</p>
            <div style="background: var(--bg); padding: 14px; border-radius: 8px; margin-bottom: 20px; font-size: 12px; color: var(--text-muted); text-align: left;">
              <div><strong>版本号：</strong>v0.6.0 (x64 Portable)</div>
              <div><strong>特性：</strong>单文件直接运行，数据目录自包含</div>
              <div><strong>文件大小：</strong>约 68MB</div>
            </div>
          </div>
          <a href="/downloads/Kotoba-0.6.0-Windows-x64-Portable.exe" class="btn btn-lg" style="width: 100%;">
            ⬇️ 下载 Windows 便携版 (Portable.exe)
          </a>
        </div>
      </div>

      <div class="card" style="margin-bottom: 48px; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
        <div>
          <h3 style="margin-bottom: 6px;">🌐 Web 在线学习版（免安装）</h3>
          <p style="margin-bottom: 0;">不想下载软件？使用 Chrome、Edge、Safari 等任何现代浏览器直接开启学习，支持添加到手机主屏幕使用。</p>
        </div>
        <a href="/app/" class="btn btn-primary btn-lg">立即打开 Web 版</a>
      </div>

      <div class="article-body">
        <h2>安全校验与常见问题 (FAQ)</h2>
        <h3>1. 官方 SHA-256 校验和文件</h3>
        <p>
          为确保你下载的安装包未被篡改，可核对发布包的 SHA-256 哈希值：
          <a href="/downloads/SHA256SUMS-0.6.0.txt" target="_blank" style="color: var(--green); text-decoration: underline;">查看 SHA256SUMS-0.6.0.txt</a>
        </p>

        <h3>2. Windows SmartScreen 提示“Windows 已保护你的电脑”？</h3>
        <p>
          由于独立开发者个人签名成本极高，全新版本发布时可能会被微软 Windows Defender SmartScreen 弹出未知发布者提示。
        </p>
        <p>
          <strong>解决方法：</strong>在提示窗口中点击 <code>“更多信息” (More Info)</code>，然后点击 <code>“仍要运行” (Run anyway)</code> 即可正常安装与运行。Kotobud 绝不包含任何恶意代码或广告插件。
        </p>

        <h3>3. 桌面端如何与手机/网页端同步学习记录？</h3>
        <p>
          在 Windows 客户端右上角点击“登录并开启云同步”，使用你的邮箱接收验证码完成登录。随后在手机或电脑浏览器中登录同一个账号，两端的数据便会自动保持一致。
        </p>
      </div>
    </div>
  `;

  return renderHtmlDocument({
    title,
    description,
    canonicalUrl,
    activePath: '/download',
    jsonLd,
    bodyContent
  });
}

// 4. About Page
function generateAboutPage() {
  const title = '关于 Kotobud - 纯粹的日语背词工具与辞书开源说明';
  const description = '了解 Kotobud 的初心与产品故事：为什么做一款没有广告的纯粹日语背词工具，从代码名 Kotoba 到正式品牌 Kotobud 的演化，词库来源与开源辞书协议声明（JMdict / EDICT / Kanjidic）。';
  const canonicalUrl = `${DOMAIN}/about`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "name": title,
    "url": canonicalUrl,
    "description": description,
    "isPartOf": { "@type": "WebSite", "name": "Kotobud", "url": DOMAIN }
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">产品初心与故事</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">关于 Kotobud：打造纯粹的日语学习手帖</h1>
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
          于是有了 Kotobud。
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

      <div style="text-align: center; margin-bottom: 60px;">
        <a href="/app/" class="btn btn-primary btn-lg">进入 Kotobud 在线学习</a>
        <a href="/guide" class="btn btn-lg" style="margin-left: 12px;">查看学习指南</a>
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
  const title = '日语背词学习指南与 FSRS 复习手册 - Kotobud';
  const description = 'Kotobud 官方日语背词与复习实用指南：新标日教材六册学习规划（N5到N1）、FSRS 算法三档评分（Again/Hard/Good）如何科学选择、如何利用碎片时间对抗遗忘曲线。';
  const canonicalUrl = `${DOMAIN}/guide`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": title,
    "description": description,
    "url": canonicalUrl
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">学习指南与方法论</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">Kotobud 日语背词与复习实用指南</h1>
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
          在公司或自习室，打开 Windows 桌面版专心复习；在通勤途中或床上，用手机 Safari/Chrome 登录同个账号。只要网络畅通，学习事件会在后台静默完成同步。
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 60px;">
        <a href="/app/" class="btn btn-primary btn-lg">现在开始今日复习</a>
        <a href="/features" class="btn btn-lg" style="margin-left: 12px;">深入了解 FSRS</a>
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
  const title = '更新日志与版本历史 - Kotobud';
  const description = '查看 Kotobud 的历史版本与更新记录：了解 v0.6.0、v0.5.0 等版本的新功能发布、FSRS 间隔重复算法迭代、桌面客户端优化与稳定性修复。';
  const canonicalUrl = `${DOMAIN}/changelog`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "url": canonicalUrl,
    "description": description,
    "isPartOf": { "@type": "WebSite", "name": "Kotobud", "url": DOMAIN }
  };

  const bodyContent = `
    <div class="container" style="padding-top: 48px;">
      <div class="section-header">
        <div class="badge-pill">版本演进历程</div>
        <h1 class="hero-title" style="margin-bottom: 12px;">Kotobud 版本更新日志</h1>
        <p>每一次迭代，都为更纯粹、更科学的日语背词体验而努力</p>
      </div>

      <div class="article-body">
        <div class="version-item">
          <div class="version-header">
            <span class="version-tag">v0.6.0</span>
            <span class="badge-pill" style="margin: 0; padding: 2px 10px; font-size: 11px;">当前最新生产版本</span>
            <span class="version-date">2026 年 9 月</span>
          </div>
          <p><strong>核心架构升级与 Windows 客户端深度优化：</strong></p>
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

      <div style="text-align: center; margin-bottom: 60px;">
        <a href="/download" class="btn btn-primary btn-lg">下载最新 v0.6.0 客户端</a>
        <a href="/app/" class="btn btn-lg" style="margin-left: 12px;">打开在线版</a>
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
      <div class="brand-mark" style="width: 64px; height: 70px; font-size: 38px; margin: 0 auto 24px;">言</div>
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
export function generateAllSeoPages(targetDir) {
  console.log(`Generating SEO static pages in: ${targetDir}`);
  mkdirSync(targetDir, { recursive: true });

  const pages = [
    { files: ['index.html'], content: generateHomePage() },
    { files: ['features.html', 'features/index.html'], content: generateFeaturesPage() },
    { files: ['download.html', 'download/index.html'], content: generateDownloadPage() },
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
