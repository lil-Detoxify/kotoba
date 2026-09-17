const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        resolve({
          url,
          statusCode: res.statusCode,
          headers: res.headers,
          bodySnippet: body.substring(0, 500)
        });
      });
    }).on('error', reject);
  });
}

async function verify() {
  console.log('--- Checking Production: https://kotoba-iuz.pages.dev ---');
  const prodHtml = await get('https://kotoba-iuz.pages.dev/');
  console.log('Status:', prodHtml.statusCode);
  console.log('x-robots-tag:', prodHtml.headers['x-robots-tag'] || 'none (indexable)');
  console.log('Title in HTML:', prodHtml.bodySnippet.match(/<title>([^<]+)<\/title>/)?.[1]);
  console.log('Canonical in HTML:', prodHtml.bodySnippet.match(/<link rel="canonical"[^>]+>/)?.[0]);

  const prodRobots = await get('https://kotoba-iuz.pages.dev/robots.txt');
  console.log('Robots.txt status:', prodRobots.statusCode);
  console.log('Robots content:\n' + prodRobots.bodySnippet.trim());

  const prodSitemap = await get('https://kotoba-iuz.pages.dev/sitemap.xml');
  console.log('Sitemap.xml status:', prodSitemap.statusCode);
  console.log('Sitemap snippet:\n' + prodSitemap.bodySnippet.trim().substring(0, 150));

  console.log('\n--- Checking Staging: https://staging.kotoba-iuz.pages.dev ---');
  const stagHtml = await get('https://staging.kotoba-iuz.pages.dev/');
  console.log('Status:', stagHtml.statusCode);
  console.log('x-robots-tag:', stagHtml.headers['x-robots-tag']);
  console.log('Title in HTML:', stagHtml.bodySnippet.match(/<title>([^<]+)<\/title>/)?.[1]);
  console.log('Robots meta injected:', stagHtml.bodySnippet.includes('noindex, nofollow'));

  const stagRobots = await get('https://staging.kotoba-iuz.pages.dev/robots.txt');
  console.log('Robots.txt status:', stagRobots.statusCode);
  console.log('Staging robots content:\n' + stagRobots.bodySnippet.trim());
}

verify().catch(console.error);
