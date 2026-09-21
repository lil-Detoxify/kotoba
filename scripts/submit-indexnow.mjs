const INDEXNOW_KEY = '4b68e91c784e4b5bb8972cae6c7104f2';
const HOST = 'kotobud.com';

const URLS = [
  `https://${HOST}/`,
  `https://${HOST}/features`,
  `https://${HOST}/download`,
  `https://${HOST}/about`,
  `https://${HOST}/guide`,
  `https://${HOST}/changelog`
];

async function submitIndexNow() {
  console.log(`Submitting ${URLS.length} URLs to IndexNow for host: ${HOST}...`);
  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: URLS
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'Kotobud-SEO-Worker/1.0'
      },
      body: JSON.stringify(payload)
    });

    console.log(`IndexNow response HTTP status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (text) {
      console.log('Response body:', text);
    }
    if (res.status === 200 || res.status === 202) {
      console.log('✓ Successfully submitted URLs to IndexNow (Bing & participating search engines)!');
      return true;
    } else {
      console.warn('IndexNow returned non-200/202 status code.');
      return false;
    }
  } catch (err) {
    console.error('Failed to submit to IndexNow:', err.message);
    return false;
  }
}

submitIndexNow().catch(err => {
  console.error(err);
  process.exit(1);
});
