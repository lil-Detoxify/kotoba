const HOST = 'https://kotobud.com';
const URLS = [
  `${HOST}/`,
  `${HOST}/features`,
  `${HOST}/download`,
  `${HOST}/about`,
  `${HOST}/guide`,
  `${HOST}/changelog`
];

async function submitBaidu() {
  const token = process.env.BAIDU_TOKEN || process.argv[2];
  if (!token) {
    console.log('----------------------------------------------------');
    console.log('Baidu Active Push (百度普通收录 - API 提交)');
    console.log('----------------------------------------------------');
    console.log('提示: 未检测到 BAIDU_TOKEN。');
    console.log('如果您已经在百度搜索资源平台完成了站点添加与验证，可以在：');
    console.log('  百度搜索资源平台 -> 普通收录 -> API提交');
    console.log('找到您的接口准入密钥 token，然后运行：');
    console.log('  node scripts/submit-baidu.mjs <YOUR_TOKEN>');
    console.log('或设置环境变量:');
    console.log('  $env:BAIDU_TOKEN="<YOUR_TOKEN>"; node scripts/submit-baidu.mjs');
    console.log('');
    console.log('准备推送的公开 URL 清单:');
    URLS.forEach(u => console.log(' - ' + u));
    console.log('----------------------------------------------------');
    return;
  }

  const endpoint = `http://data.zz.baidu.com/urls?site=https://kotobud.com&token=${token}`;
  console.log(`Pushed ${URLS.length} URLs to Baidu API: ${endpoint}...`);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: URLS.join('\n')
    });

    const data = await res.json();
    console.log('Baidu API response status:', res.status);
    console.log('Response body:', JSON.stringify(data, null, 2));

    if (data.success) {
      console.log(`✓ 成功推送到百度！本次推送成功条数: ${data.success}，今日剩余额度: ${data.remain}`);
    } else {
      console.warn('Baidu API error:', data.message);
    }
  } catch (err) {
    console.error('Failed to submit to Baidu:', err.message);
  }
}

submitBaidu().catch(err => {
  console.error(err);
  process.exit(1);
});
