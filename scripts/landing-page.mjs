const arrow = '<span class="link-arrow" aria-hidden="true">↗</span>';
const sprout = `<svg viewBox="0 0 240 260" fill="none" aria-hidden="true" class="sprout-art"><path d="M119 244V129C119 80 154 37 209 22c7 63-25 106-89 107Z" stroke="currentColor" stroke-width="2"/><path d="M118 166C65 172 29 139 26 85c53-3 91 31 92 81Z" stroke="currentColor" stroke-width="2"/><path d="m119 129 57-69M118 166l-59-51" stroke="currentColor" stroke-width="1.5"/></svg>`;

export function renderLandingContent(version, windowsVersion) {
  const books = [
    ['01', '初级上册', '初', 'N5 / N4', '生活中的第一句日语'],
    ['02', '初级下册', '歩', 'N5 / N4', '让日常表达更完整'],
    ['03', '中级上册', '進', 'N3 / N2', '走进阅读与篇章'],
    ['04', '中级下册', '深', 'N3 / N2', '理解更丰富的语境'],
    ['05', '高级上册', '広', 'N1', '拓宽语言的边界'],
    ['06', '高级下册', '遠', 'N1', '迈向更远的世界'],
  ];
  return `
  <div class="reading-progress" aria-hidden="true"><div></div></div>
  <section class="landing-hero" aria-labelledby="landing-title">
    <div class="container hero-layout">
      <div class="hero-copy">
        <p class="eyebrow hero-enter"><span class="status-dot"></span> KOTOBUD · 日语背词与复习工具</p>
        <h1 id="landing-title"><span class="title-mask"><span>每天，</span></span><span class="title-mask"><span>让日语<span class="serif-em">生长</span>一点。</span></span></h1>
        <p class="hero-subtitle hero-enter">ことばを、少しずつ。<span>一份纯粹自律的日语学习手帖。</span></p>
        <p class="hero-summary hero-enter">从标日第一课，到每一次恰到好处的复习。<br>把看词、识字、听音，变成真正记得的日语。</p>
        <div class="hero-actions hero-enter">
          <a href="/app/" class="btn btn-primary btn-lg" id="hero-primary-btn"><span>开始在线背词</span>${arrow}</a>
          <a href="/download" class="download-link">客户端下载与平台指引 ${arrow}</a>
        </div>
        <p class="hero-platforms hero-enter">Web 版免安装，即开即学 <span>／</span> Windows v${windowsVersion}</p>
        <a class="release-note hero-enter" href="/changelog#web"><span>WEB · v${version}</span> 新词书、学习统计与准确续学 <span aria-hidden="true">→</span></a>
      </div>
      <div class="hero-art" aria-label="日语词卡设计示意">
        <div class="hero-orbit" aria-hidden="true"><span>LEARN A LITTLE. REMEMBER A LITTLE MORE.</span></div>
        <div class="art-parallax"><div class="art-entry">
          <div class="word-sheet sheet-back" aria-hidden="true"><span>ことばの手帖</span><img class="sheet-brand-mark" src="/brand/kotobud-mark.svg" alt="" width="92" height="92"><small>毎日、少しずつ。</small></div>
          <div class="word-sheet sheet-middle" aria-hidden="true"><span>記憶を育てる</span><b>憶</b></div>
          <div class="word-sheet sheet-front">
            <div class="sheet-top"><span>今日のことば</span><span>词卡示意 · 01</span></div>
            <div class="word-reading" lang="ja">めぶく</div><div class="word-kanji" lang="ja">芽吹く</div>
            <div class="word-meaning">发芽，萌发。<span>就像每天多记住的那一个词。</span></div>
            <div class="sheet-bottom"><span class="mini-sprout">${sprout}</span><span>每一次复习，都在生长。</span><span aria-hidden="true">↗</span></div>
          </div>
          <span class="art-stamp" aria-hidden="true">日々<br>成長</span>
        </div></div>
        <span class="art-caption">A LITTLE EVERY DAY / 每天，认识一点日语。</span>
      </div>
    </div>
    <div class="container hero-baseline"><a href="#introduction" class="scroll-cue">向下，翻开这份手帖 <span aria-hidden="true">↓</span></a><span>WEB & WINDOWS · 纯净无广告</span></div>
  </section>

  <div class="container proof-strip" aria-label="产品核心信息">
    <div><strong>06<span>册</span></strong><span>标日初级 · 中级 · 高级</span></div>
    <div><strong>10,000<span>+</span></strong><span>按课次编排的词条</span></div>
    <div><strong>FSRS</strong><span>科学间隔重复算法</span></div>
    <div><strong>形 · 音 · 义</strong><span>假名、汉字与听音测验</span></div>
  </div>

  <section id="introduction" class="landing-section introduction">
    <div class="container">
      <div class="section-heading" data-reveal><p class="eyebrow">一份关于学习的手帖 / INTRODUCTION</p><h2>把注意力，<br>留给<span class="serif-em">真正的学习。</span></h2></div>
      <div class="intro-layout">
        <p class="intro-description" data-reveal>Kotobud 是一款专注高效的日语单词学习与复习软件（Japanese vocabulary learning and review app）。完整收录《新版中日交流标准日本语》初级、中级、高级全六册官方词书，深度融合前沿 FSRS 科学间隔重复算法，提供假名、汉字与听音多维度自适应测验，帮助学习者攻克“背了就忘、假名汉字脱节”的记忆难题。</p>
        <div class="intro-notes">
          <article data-reveal><span class="note-number">01 /</span><h3>Kotobud 是什么？</h3><p>一款现代化、纯粹克制的日语背词与间隔重复复习工具。摒弃繁琐花哨的社交裂变与开屏广告，回归“看词、识字、听音、记忆”的自律学习手帖本质。</p></article>
          <article data-reveal><span class="note-number">02 /</span><h3>Kotobud 面向谁？</h3><p>专为《新标日》自学读者、日语五十音进阶者、JLPT（N5/N4/N3/N2/N1）备考考生，以及希望通过科学记忆模型告别死记硬背的日语学习者量身设计。</p></article>
          <article data-reveal><span class="note-number">03 /</span><h3>解决什么学习痛点？</h3><p>解决传统背词工具广告繁多、打卡干扰、机械式生硬重复已熟词汇，以及“认得汉字却读不出假名、会读假名却听不出真音”的形音义割裂痛点。</p></article>
          <article data-reveal><span class="note-number">04 /</span><h3>提供哪些核心能力？</h3><p>标日全六册课次词库、FSRS 自适应遗忘曲线算法、假名/汉字/听音自测流、个人生词本攻坚，并支持 Local-First 离线背词与多端云同步。</p></article>
        </div>
      </div>
    </div>
  </section>

  <section id="features" class="landing-section books-section">
    <div class="container">
      <div class="chapter-heading" data-reveal><span class="chapter-number">01</span><div><p class="eyebrow">有迹可循 / A PATH TO FOLLOW</p><h2>从第一课，<br>到<span class="serif-em">更远处。</span></h2></div><span class="chapter-side" lang="ja">学びの道</span></div>
      <div class="books-intro" data-reveal><h3>新标日全六册官方词书</h3><p>从五十音到 N1 级别，为每一个课次定制高效的复习与检测路径。完整收录初级上/下册、中级上/下册、高级上/下册；词条按课次、单元科学归类，词性、音调、读音一应俱全。</p></div>
      <div class="book-shelf">${books.map(([n,name,kanji,level,caption])=>`<a href="/features" class="book-cover"><span class="book-top">STANDARD JAPANESE <span>${n}</span></span><span class="book-kanji" lang="ja">${kanji}</span><span class="book-title">${name}</span><span class="book-level">${level}</span><span class="book-caption">${caption} ${arrow}</span></a>`).join('')}</div>
      <div class="book-footnotes" data-reveal><p><span>初级</span> 打牢 N5/N4 日常基础词汇</p><p><span>中级</span> 攻克 N3/N2 进阶语法与阅读词</p><p><span>高级</span> 冲刺 N1 商务、新闻与学术词汇</p></div>
      <a href="/features" class="text-link" data-reveal>深入了解标日全六册划分 ${arrow}</a>
    </div>
  </section>

  <div class="word-ribbon" aria-hidden="true"><div class="ribbon-track">${Array.from({length:2},()=>`<div class="ribbon-set">${Array.from({length:3},()=>'<span>ことば</span><i>✳</i><span>記憶</span><i>✳</i><span>毎日</span><i>✳</i>').join('')}</div>`).join('')}</div></div>

  <section class="landing-section memory-section">
    <div class="container">
      <div class="chapter-heading" data-reveal><span class="chapter-number">02</span><div><p class="eyebrow">让记忆扎根 / MAKE IT STAY</p><h2>不止见过。<br>更要<span class="serif-em">真正记得。</span></h2></div><span class="chapter-side" lang="ja">記憶を育てる</span></div>
      <div class="memory-layout">
        <div class="memory-preview">
          <div class="preview-heading"><span class="status-dot"></span><span>学习方式示意</span><span class="preview-page">01 / 03</span></div>
          <div class="demo-stage">
            <div class="demo-pane" data-demo="0">
              <p class="demo-label">SPACED REPETITION / 科学复习</p>
              <div class="demo-word" lang="ja">続ける<small>つづける · 继续，坚持</small></div>
              <svg class="memory-curve" viewBox="0 0 400 116" fill="none" aria-label="复习让记忆再次增强的示意曲线"><path d="M5 108H395M5 10V108" stroke="#d6dfd1"/><path class="curve-path" d="M8 24C26 44 32 78 58 96L63 23C93 45 109 83 150 95L155 22C191 48 246 77 285 91L290 22C317 40 351 56 393 62" stroke="#365d49" stroke-width="2.5"/><circle cx="63" cy="23" r="4" fill="#365d49"/><circle cx="155" cy="22" r="4" fill="#365d49"/><circle cx="290" cy="22" r="4" fill="#365d49"/></svg>
              <div class="curve-caption"><span>学习</span><span>复习</span><span>巩固</span><span>记得更久</span></div>
              <div class="rating-example"><span>重来 <small>Again</small></span><span>困难 <small>Hard</small></span><span>良好 <small>Good</small></span></div>
              <p class="demo-hint">每一次反馈，都让下一次复习更适合你。</p>
            </div>
            <div class="demo-pane" data-demo="1" hidden>
              <p class="demo-label">RECOGNIZE · READ · LISTEN / 多维测验</p>
              <div class="mode-switch" role="group" aria-label="切换测验示意"><button type="button" data-mode="kanji" aria-pressed="true">看汉字</button><button type="button" data-mode="kana" aria-pressed="false">看假名</button><button type="button" data-mode="audio" aria-pressed="false">听音</button></div>
              <div class="mode-display" aria-live="polite"><div class="mode-prompt" lang="ja">木漏れ日</div><div class="audio-wave" aria-hidden="true" hidden>${Array.from({length:17},(_,i)=>`<i style="--bar:${[24,40,64,32,78,96,56,80,100,60,86,44,72,32,56,38,20][i]}%"></i>`).join('')}</div><p class="mode-description">从汉字，回忆读音与词义。</p></div>
              <div class="sample-answer"><span>こもれび</span><span>树叶间洒落的阳光</span></div><p class="demo-hint">形、音、义，连成一份完整的记忆。</p>
            </div>
            <div class="demo-pane" data-demo="2" hidden>
              <p class="demo-label">YOUR WORDS / 生词强化</p>
              <div class="demo-word" lang="ja">巡り会う<small>めぐりあう · 邂逅，偶然相遇</small></div>
              <p class="collection-copy">那些还没记牢的词，<br>值得再多一点关注。</p>
              <button type="button" class="collect-button" aria-pressed="false"><span class="collect-star" aria-hidden="true">☆</span><span class="collect-label">试着加入生词本</span></button>
              <p class="collection-status demo-hint" role="status">点击体验收藏反馈，仅为交互示意。</p>
            </div>
          </div>
          <div class="preview-tabs" role="group" aria-label="切换学习方式示意"><button type="button" data-preview="0" aria-pressed="true">01 科学复习</button><button type="button" data-preview="1" aria-pressed="false">02 多维测验</button><button type="button" data-preview="2" aria-pressed="false">03 生词强化</button></div>
          <a href="/app/" class="preview-link">在 Web 版开始真实学习 ${arrow}</a>
        </div>
        <div class="memory-stories">
          <article class="memory-story" data-story="0"><span class="story-index">01 / 记忆有自己的节奏</span><h3>把复习，<br>放在恰好的时候。</h3><p>内置新一代 FSRS (Free Spaced Repetition Scheduler) 智能间隔重复算法，针对个人记忆遗忘曲线，自适应预测下一次复习时机。</p><ul><li>精准度远超传统艾宾浩斯与 Anki SM-2</li><li>Again（重来）/ Hard（困难）/ Good（良好）三档评分</li><li>减少重复学习已掌握单词的疲劳感</li></ul><a href="/guide#fsrs" class="text-link">了解 FSRS 三档打分标准 ${arrow}</a></article>
          <article class="memory-story" data-story="1"><span class="story-index">02 / 把形、音、义连起来</span><h3>认得它。读出它。<br>也能<span class="serif-em">听懂它。</span></h3><p>单词不仅要会认，更要能听懂、知读音。多模式自适应测验，攻克“看得懂但听不出、会读但选不对”的学习痛点。</p><ul><li>汉字识别：看汉字写假名与词义</li><li>听音辨析：真人发音听力抓词</li><li>反向测试：看中文释义回忆日文拼写</li></ul><a href="/features" class="text-link">查看自适应测验功能详情 ${arrow}</a></article>
          <article class="memory-story" data-story="2"><span class="story-index">03 / 把精力留给薄弱项</span><h3>难记的词，<br>慢慢<span class="serif-em">变熟悉。</span></h3><p>随时将易混淆、难记的单词加入个人生词本。支持按难词标记、忽略熟悉词、错题重练等灵活筛选，让精力聚焦在提分刀刃上。</p><a href="/guide#habits" class="text-link">查阅高效背词习惯指南 ${arrow}</a></article>
        </div>
      </div>
    </div>
  </section>

  <section class="landing-section anywhere-section">
    <div class="container">
      <div class="chapter-heading" data-reveal><span class="chapter-number">03</span><div><p class="eyebrow">日常，就是最好的场景 / IN YOUR EVERYDAY</p><h2>学习，<br>跟着<span class="serif-em">你走。</span></h2></div><span class="chapter-side" lang="ja">いつでも、どこでも</span></div>
      <div class="anywhere-layout">
        <div class="device-art" aria-hidden="true" data-reveal><div class="device-orbit"></div><div class="device-window"><div class="window-bar"><i></i><i></i><i></i><span>Kotobud / Windows</span></div><div class="device-word">言葉<small>ことば · 语言，词语</small></div><span class="device-line"></span><span class="device-line short"></span></div><div class="browser-note"><span>WEB / 即开即学</span><b>言葉</b><small>同一份学习进度。</small></div><div class="sync-label"><span class="status-dot"></span> 本地优先 · 多端云同步</div></div>
        <div class="anywhere-copy"><article data-reveal><h3>多端云同步与本地优先</h3><p>采用 Local-First 本地优先架构，断网也能在离线状态下顺畅背词。联网后自动增量合并多设备学习进度，Web 端与桌面端无缝协同。</p><div class="platform-labels"><span>Web v${version}</span><span>Windows v${windowsVersion}</span></div><p><a href="/download#extension" class="text-link">浏览器扩展 · 下载测试版 ${arrow}</a></p><p><a href="/guide#miniprogram" class="text-link">微信小程序 · 准备状态与指引 ${arrow}</a></p><a href="/download" class="text-link">选择你的学习方式 ${arrow}</a></article><article data-reveal><h3>在真实语境中，理解词汇</h3><p>内置详尽的词典释义扩展、词性剖析与日汉对照例句，词汇放在真实语境中理解；遵循 JMdict / EDICT 开源协议，纯净无私。</p><a href="/about" class="text-link">了解 Kotobud 品牌故事与开源协议 ${arrow}</a></article></div>
      </div>
    </div>
  </section>

  <section class="quiet-section">
    <div class="container"><p class="eyebrow" data-reveal>为什么选择 KOTOBUD / SPACE TO FOCUS</p><h2><span class="quiet-line">少一点打扰。</span><span class="quiet-line">多一点<span class="serif-em">记得。</span></span></h2><p class="quiet-intro" data-reveal>一份安静、克制、纯粹的日语学习手帖，尊重你的时间和注意力。</p><div class="quiet-principles"><article data-reveal><span>01 / PURE</span><h3>零广告，无弹窗骚扰</h3><p>没有开屏推销、没有虚拟币充值、没有社交打卡分享捆绑。打开网页或应用，立刻进入沉浸式日语背词状态。</p></article><article data-reveal><span>02 / LIGHT</span><h3>极速轻巧，本地离线可用</h3><p>依托现代轻量技术构建，无论是 Windows 桌面客户端还是网页端，启动迅速，随时随地开启背词。</p></article><article data-reveal><span>03 / FOCUSED</span><h3>专注标准日本语教材</h3><p>专为标日读者设计课次同步学习模式，课前预习生词、课后巩固测试，契合自学与各类日语培训班进度。</p></article></div></div>
  </section>

  <section class="landing-section final-section">
    <div class="container final-layout"><div><p class="eyebrow" data-reveal>下一页，留给你 / YOUR NEXT CHAPTER</p><h2 data-reveal>今天，<br>也认识<span class="serif-em">一点日语。</span></h2><p data-reveal>无论你是刚刚掌握五十音图的新手，还是正在备战 JLPT N2/N1 的进阶者，Kotobud 都将成为你最长情的单词伙伴。</p><div class="hero-actions" data-reveal><a href="/app/" class="btn btn-primary btn-lg">进入在线背词 ${arrow}</a><a href="/download" class="download-link">下载 Windows v${windowsVersion} ${arrow}</a></div><a href="/guide" class="text-link" data-reveal>新手先读：标日背词与复习实用指南 ${arrow}</a></div><div class="final-art" aria-hidden="true">${sprout}<span lang="ja">ことばを、少しずつ。</span></div></div>
  </section>`;
}
