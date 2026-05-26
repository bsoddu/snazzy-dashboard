exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    var body = JSON.parse(event.body);
    var url = body.url;
    if (!url) return { statusCode: 400, body: JSON.stringify({error: 'URL mancante'}) };

    var prompt = `Sei un esperto SEO, UX e conversion rate optimization. Analizza questo sito web: ${url}

Cerca informazioni reali sul sito, analizza struttura, contenuti, SEO, performance e UX.
Rispondi SOLO con JSON valido, nessun testo fuori dal JSON.

{
  "overall_score": <numero 0-100>,
  "overall_label": "<Ottimo|Buono|Discreto|Da migliorare|Critico>",
  "overall_summary": "<descrizione del sito in 1-2 frasi>",
  "categories": [
    {
      "name": "SEO & Visibilità",
      "score": <0-100>,
      "items": [
        {"status": "<ok|warn|err>", "text": "<titolo problema o punto forza>", "detail": "<spiegazione e suggerimento concreto>"},
        {"status": "...", "text": "...", "detail": "..."},
        {"status": "...", "text": "...", "detail": "..."},
        {"status": "...", "text": "...", "detail": "..."},
        {"status": "...", "text": "...", "detail": "..."}
      ]
    },
    {
      "name": "Performance & Velocità",
      "score": <0-100>,
      "items": [<5 items>]
    },
    {
      "name": "UX & Conversione",
      "score": <0-100>,
      "items": [<5 items>]
    },
    {
      "name": "Contenuto & Copy",
      "score": <0-100>,
      "items": [<5 items>]
    },
    {
      "name": "Tecnico & Sicurezza",
      "score": <0-100>,
      "items": [<5 items>]
    }
  ],
  "top_actions": [
    "<azione prioritaria concreta 1>",
    "<azione prioritaria concreta 2>",
    "<azione prioritaria concreta 3>"
  ]
}`;

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20251001',
        max_tokens: 2000,
        tools: [{"type": "web_search_20250305", "name": "web_search"}],
        messages: [{role: 'user', content: prompt}]
      })
    });

    var data = await res.json();
    var text = data.content.map(function(b){ return b.type === 'text' ? b.text : ''; }).join('');
    var clean = text.replace(/```json|```/g, '').trim();
    var start = clean.indexOf('{');
    var end = clean.lastIndexOf('}');
    var result = JSON.parse(clean.slice(start, end + 1));
    return { statusCode: 200, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(result) };
  } catch(e) {
    return { statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: e.message}) };
  }
};
