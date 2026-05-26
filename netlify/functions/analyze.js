exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let siteUrl;
  try {
    const body = JSON.parse(event.body || '{}');
    siteUrl = body.url;
    if (!siteUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL mancante' }) };
    if (!siteUrl.startsWith('http')) siteUrl = 'https://' + siteUrl;
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body non valido' }) };
  }

  function timed(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
  }

  const base = new URL(siteUrl).origin;
  const psUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' +
    encodeURIComponent(siteUrl) +
    '&strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices';

  // Tutte le fetch in parallelo
  const [htmlRes, psRes, robotsRes, sitemapRes] = await Promise.allSettled([
    timed(
      fetch(siteUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SnazzyAnalyzer/1.0)' } }),
      8000
    ).then(r => r.text()).then(t => t.slice(0, 40000)),
    timed(fetch(psUrl), 9000).then(r => r.json()),
    timed(fetch(base + '/robots.txt'), 5000).then(r => r.ok ? r.text() : null),
    timed(fetch(base + '/sitemap.xml'), 5000).then(r => r.ok)
  ]);

  const html = htmlRes.status === 'fulfilled' ? htmlRes.value : null;
  const htmlError = htmlRes.status === 'rejected' ? htmlRes.reason.message : null;

  let ps = null;
  if (psRes.status === 'fulfilled' && psRes.value?.lighthouseResult) {
    const c = psRes.value.lighthouseResult.categories;
    const a = psRes.value.lighthouseResult.audits;
    ps = {
      performance: Math.round((c.performance?.score || 0) * 100),
      seo: Math.round((c.seo?.score || 0) * 100),
      accessibility: Math.round((c.accessibility?.score || 0) * 100),
      bestPractices: Math.round((c['best-practices']?.score || 0) * 100),
      fcp: a['first-contentful-paint']?.displayValue || 'n/d',
      lcp: a['largest-contentful-paint']?.displayValue || 'n/d',
      cls: a['cumulative-layout-shift']?.displayValue || 'n/d',
      tbt: a['total-blocking-time']?.displayValue || 'n/d',
      speedIndex: a['speed-index']?.displayValue || 'n/d',
    };
  }

  const robotsTxt = robotsRes.status === 'fulfilled' && robotsRes.value ? robotsRes.value.slice(0, 500) : null;
  const sitemapOk = sitemapRes.status === 'fulfilled' ? !!sitemapRes.value : false;

  let seo = {};
  if (html) {
    const g = (re) => html.match(re)?.[1]?.trim() || '';
    seo = {
      title: g(/<title[^>]*>([^<]+)<\/title>/i),
      metaDesc: g(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) ||
                g(/<meta[^>]+content=["']([^"']*)[^>]+name=["']description["']/i),
      h1: [...html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)].map(m => m[1].trim()).filter(Boolean),
      h2count: (html.match(/<h2/gi) || []).length,
      imgTotal: (html.match(/<img/gi) || []).length,
      imgNoAlt: (html.match(/<img(?![^>]*\balt=)[^>]*>/gi) || []).length,
      canonical: g(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i),
      ogTitle: g(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i),
      ogImage: !!html.match(/<meta[^>]+property=["']og:image["']/i),
      viewport: !!html.match(/<meta[^>]+name=["']viewport["']/i),
      https: siteUrl.startsWith('https://'),
      schema: (html.match(/application\/ld\+json/gi) || []).length,
      lang: g(/<html[^>]+lang=["']([^"']*)/i),
    };
  }

  const dati = `
URL ANALIZZATO: ${siteUrl}

--- HTML / SEO REALE ---
${htmlError ? `Impossibile accedere al sito: ${htmlError}` : `
Titolo pagina: "${seo.title}" (${seo.title?.length || 0} caratteri${seo.title?.length > 60 ? ' — TROPPO LUNGO' : seo.title?.length < 30 ? ' — TROPPO CORTO' : ' — OK'})
Meta description: "${seo.metaDesc}" (${seo.metaDesc?.length || 0} caratteri${seo.metaDesc?.length > 160 ? ' — TROPPO LUNGA' : !seo.metaDesc ? ' — ASSENTE' : ' — OK'})
H1: ${seo.h1?.length ? seo.h1.join(' | ') : 'ASSENTE'}
H2: ${seo.h2count} presenti
HTTPS: ${seo.https ? 'Sì ✓' : 'NO ✗'}
Viewport meta: ${seo.viewport ? 'Presente ✓' : 'ASSENTE ✗'}
Canonical URL: ${seo.canonical || 'Non trovato'}
OG Title: ${seo.ogTitle || 'Assente'}
OG Image: ${seo.ogImage ? 'Presente ✓' : 'Assente ✗'}
Attributo lang HTML: ${seo.lang || 'Assente'}
Immagini totali: ${seo.imgTotal} | Senza attributo alt: ${seo.imgNoAlt}
Schema.org: ${seo.schema > 0 ? seo.schema + ' blocchi ✓' : 'Assente ✗'}
`}

--- GOOGLE PAGESPEED INSIGHTS (MOBILE) ---
${!ps ? 'Dati non disponibili (timeout o errore API)' : `
Performance: ${ps.performance}/100
SEO score Google: ${ps.seo}/100
Accessibilità: ${ps.accessibility}/100
Best Practices: ${ps.bestPractices}/100
First Contentful Paint: ${ps.fcp}
Largest Contentful Paint: ${ps.lcp}
Cumulative Layout Shift: ${ps.cls}
Total Blocking Time: ${ps.tbt}
Speed Index: ${ps.speedIndex}
`}

--- TECNICO ---
robots.txt: ${robotsTxt !== null ? 'Presente ✓\n' + robotsTxt : 'Non trovato ✗'}
sitemap.xml: ${sitemapOk ? 'Presente ✓' : 'Non trovata ✗'}
`.trim();

  const prompt = `Sei un esperto SEO, UX e CRO. Analizza il sito basandoti ESCLUSIVAMENTE sui dati reali qui sotto. Non inventare nulla. Se un dato non è disponibile, dillo nel detail.

${dati}

Rispondi SOLO con JSON valido, zero testo fuori, zero markdown, zero backtick.

{"overall_score":<0-100 basato sui dati reali>,"overall_label":"<Ottimo|Buono|Discreto|Da migliorare|Critico>","overall_summary":"<sintesi concreta basata sui dati>","categories":[{"name":"SEO & Visibilità","score":<da title/meta/h1/canonical/schema reali>,"items":[{"status":"<ok|warn|err>","text":"<fatto reale>","detail":"<spiegazione concreta con i valori trovati>"},{"status":"...","text":"...","detail":"..."},{"status":"...","text":"...","detail":"..."},{"status":"...","text":"...","detail":"..."},{"status":"...","text":"...","detail":"..."}]},{"name":"Performance & Velocità","score":<da PageSpeed reale o stima se n/d>,"items":[<5 items con valori Core Web Vitals reali>]},{"name":"UX & Design","score":<0-100>,"items":[<5 items>]},{"name":"Contenuto & Copy","score":<0-100>,"items":[<5 items>]},{"name":"Tecnico & Sicurezza","score":<da HTTPS/robots/sitemap/viewport reali>,"items":[<5 items>]}],"top_actions":["<azione concreta sul problema più grave trovato>","<azione concreta 2>","<azione concreta 3>"]}`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: data.error?.message || 'Errore API Anthropic' }) };
    }

    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Risposta non valida: ' + text.slice(0, 200) }) };
    }

    const result = JSON.parse(text.slice(start, end + 1));
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
