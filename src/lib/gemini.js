// Análise IA via Google Gemini com Google Search grounding.
// A chave vem exclusivamente do .env (VITE_GEMINI_KEY) — configure no
// provedor de deploy (ex.: Vercel). A probabilidade segue sendo a
// estatística; a IA só adiciona contexto (notícias, lesões, escalações).

const ENV_KEY = import.meta.env.VITE_GEMINI_KEY || ''
const MODEL = 'gemini-2.5-flash'

export async function analyzeMatch(home, away, league) {
  const key = ENV_KEY
  if (!key) return { ok: false, needKey: true }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`
  const prompt =
    `Você é um analista de futebol. Use a busca para achar notícias MUITO recentes ` +
    `sobre o jogo "${home} x ${away}" (${league}): lesões, suspensões, escalação provável, ` +
    `forma recente e fatores que afetem o resultado. ` +
    `Responda APENAS com JSON válido, sem markdown e sem texto extra, no formato: ` +
    `{"resumo":"2 frases curtas","fatores":["fator 1","fator 2","fator 3"],` +
    `"ajuste":"casa|fora|neutro","confianca":"alta|media|baixa"}. Em português.`

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return { ok: false, msg: `(API Gemini: ${r.status})` + (/API_KEY/i.test(t) ? ' — verifique a chave.' : '') }
    }
    const data = await r.json()
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n')
    const clean = text.replace(/```json|```/g, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    const parsed = JSON.parse(clean.slice(start, end + 1))
    return { ok: true, data: parsed }
  } catch {
    return { ok: false, msg: '(confira a chave do Gemini e a conexão)' }
  }
}
