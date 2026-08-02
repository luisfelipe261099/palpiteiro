// Proxy + cache dos endpoints do TheSportsDB usados pelo app.
//
//   GET /api/tsdb?p=eventsround.php?id=4351&r=20&s=2026
//
// Por que existe: o app fazia ~70 requisições DIRETAS do navegador de cada
// visitante para a chave gratuita compartilhada do TheSportsDB, que bloqueia
// IPs sob rajada — a descoberta de jogos passava e o histórico das rodadas
// falhava silenciosamente (todos os cards ficavam com placar 1-1 e a aba de
// bilhetes vazia). Com o proxy, a resposta fica cacheada na CDN da Vercel
// (s-maxage) e TODOS os visitantes compartilham o mesmo cache: o TheSportsDB
// recebe no máximo uma rajada a cada 5 minutos no total, não por usuário.
//
// A chave também sai do bundle do cliente: defina TSDB_KEY (ou reaproveite
// VITE_TSDB_KEY) na Vercel; sem env, usa a chave pública "123".

const ALLOWED = new Set([
  'eventsday.php',
  'eventsnextleague.php',
  'eventsround.php',
  'eventsseason.php',
  'lookupevent.php',
])

export default async function handler(req, res) {
  const p = String(req.query.p || '')
  const qIdx = p.indexOf('?')
  const file = qIdx === -1 ? p : p.slice(0, qIdx)
  if (!ALLOWED.has(file)) {
    return res.status(400).json({ error: 'endpoint não permitido' })
  }

  // remonta a query só com parâmetros conhecidos e valores simples (anti-SSRF)
  const params = new URLSearchParams(qIdx === -1 ? '' : p.slice(qIdx + 1))
  const clean = new URLSearchParams()
  for (const k of ['id', 'r', 's', 'd']) {
    const v = params.get(k)
    if (v != null && /^[\w. -]{1,40}$/.test(v)) clean.set(k, v)
  }

  const key = process.env.TSDB_KEY || process.env.VITE_TSDB_KEY || '123'
  const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/${file}?${clean.toString()}`

  try {
    const r = await fetch(url)
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` })
    const data = await r.json()
    // placar ao vivo precisa ser fresco; o resto vive 5 min na CDN (e serve
    // versão antiga enquanto revalida — visitantes nunca esperam o upstream)
    const fresh = file === 'lookupevent.php'
    res.setHeader(
      'Cache-Control',
      fresh ? 's-maxage=45, stale-while-revalidate=120' : 's-maxage=300, stale-while-revalidate=1800',
    )
    return res.status(200).json(data)
  } catch {
    return res.status(502).json({ error: 'falha ao consultar o TheSportsDB' })
  }
}
