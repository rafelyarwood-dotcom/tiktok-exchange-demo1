function cleanUsername(input = '') {
  return String(input).trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
}

function decodeHtml(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, 'i');
  return decodeHtml((html.match(re1) || html.match(re2) || [])[1] || '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const username = cleanUsername(req.query?.username || '');
  if (!username) return res.status(400).json({ error: 'Enter a TikTok username.' });

  const url = `https://www.tiktok.com/@${encodeURIComponent(username)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        'accept-language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(404).json({ error: 'User not found or TikTok blocked the lookup.' });
    }

    const html = await response.text();
    const ogTitle = meta(html, 'og:title');
    const ogImage = meta(html, 'og:image');
    const description = meta(html, 'og:description');
    const unavailable = /couldn.?t find this account|page not available|account not found/i.test(html);

    if (unavailable || (!ogTitle && !ogImage)) {
      return res.status(404).json({ error: 'User not found or TikTok blocked the lookup.' });
    }

    let displayName = ogTitle || `@${username}`;
    displayName = displayName
      .replace(/ on TikTok.*$/i, '')
      .replace(/\(@[^)]+\).*$/i, '')
      .trim();

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      username,
      displayName: displayName || username,
      avatar: ogImage,
      description,
      profileUrl: url
    });
  } catch (err) {
    return res.status(502).json({ error: 'TikTok lookup failed. Try again in a moment.' });
  }
}
