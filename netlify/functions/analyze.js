exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let url;
  try {
    const body = JSON.parse(event.body || '{}');
    url = body.url;
    if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL mancante' }) };
    if (!url.startsWith('http')) url = 'https://' + url;
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body non valido' }) };
  }

  const prompt = `Sei un esperto SEO, UX e conversion rate optimization. Analizza questo sito web: ${url}

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, senza markdown, senza backtick.

{
  "overall_score": <numero 0-100>,
  "overall_label": "<Ottimo|Buono|Discreto|Da migliorare|Critico>",
  "overall_summary": "<descrizione del sito in 1-2 frasi>",
  "categories": [
    {
      "name": "SEO & Visibilità",
      "score": <0-100>,
      "items": [
        {"status": "<ok|warn|err>", "text": "<titolo>", "detail": "<spiegazione>"},
        {"status": "<ok|warn|err>", "text": "<titolo>", "detail": "<spiegazione>"},
        {"status": "<ok|warn|err>", "text": "<titolo>", "detail": "<spiegazione>"},
        {"status": "<ok|warn|err>", "text": "<titolo>", "detail": "<spiegazione>"},
        {"status": "<ok|warn|err>", "text": "<titolo>", "detail": "<spiegazione>"}
      ]
    },
    {"name": "Performance & Velocità", "score": <0-100>, "items": [<5 items>]},
    {"name": "UX & Conversione", "score": <0-100>, "items": [<5 items>]},
    {"name": "Contenuto & Copy", "score": <0-100>, "items": [<5 items>]},
    {"name": "Tecnico & Sicurezza", "score": <0-100>, "items": [<5 items>]}
  ],
  "top_actions": [
    "<azione prioritaria 1>",
    "<azione prioritaria 2>",
    "<azione prioritaria 3>"
  ]
}`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: data.error?.message || 'Errore API Anthropic' }) };
    }

    if (!data.content || !data.content.length) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Risposta vuota da Claude' }) };
    }

    const text = data.content.find(b => b.type === 'text')?.text || '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Risposta non JSON: ' + text.slice(0, 100) }) };
    }

    const result = JSON.parse(text.slice(start, end + 1));
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
