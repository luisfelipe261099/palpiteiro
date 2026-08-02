// Cliente do TheSportsDB com cache em memória + retry/backoff.
//
// Em produção as chamadas passam pelo PROXY do próprio site (/api/tsdb),
// que cacheia na CDN da Vercel — todos os visitantes compartilham o mesmo
// cache e a chave compartilhada não é bombardeada (ela BLOQUEIA IPs sob
// rajada, o que deixava todos os cards sem estatística). Rodando local sem
// as funções serverless, cai automaticamente no acesso direto.
//
// ATENÇÃO à escolha da chave: em ago/2026 a chave pública "3" passou a
// TRUNCAR o eventsround.php em ~5 eventos (uma rodada da Série A tem 10),
// o que quebrava força/forma e esvaziava os bilhetes. A chave pública
// "123" retorna a rodada COMPLETA — é o novo padrão.
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
const KEY = env.VITE_TSDB_KEY || '123'
export const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}/`

const PROXY = '/api/tsdb'
let proxyState = 'unknown' // 'unknown' | 'on' | 'off' (off = dev local sem /api)

const cache = new Map() // path -> { ts, data }
const CACHE_TTL = 5 * 60 * 1000 // 5 min

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// semáforo: no máx. 5 requisições simultâneas — mesmo no fallback direto,
// rajadas grandes fazem a chave compartilhada recusar conexões.
const MAX_CONCURRENT = 5
let running = 0
const waiters = []
async function acquire() {
  if (running >= MAX_CONCURRENT) await new Promise((r) => waiters.push(r))
  running++
}
function release() {
  running--
  const w = waiters.shift()
  if (w) w()
}

// uma tentativa de buscar o JSON de `path` (sem cache, sem retry):
// proxy do site primeiro, acesso direto como fallback.
export async function fetchJson(path) {
  await acquire()
  try {
    if (proxyState !== 'off') {
      try {
        const r = await fetch(`${PROXY}?p=${encodeURIComponent(path)}`)
        const ct = r.headers.get('content-type') || ''
        if (r.ok && ct.includes('json')) {
          proxyState = 'on'
          return await r.json()
        }
        // resposta não-JSON/404 na primeira tentativa = função inexistente
        // (dev local com vite puro, que devolve o index.html) -> direto
        if (proxyState === 'unknown') proxyState = 'off'
        // proxy existe mas falhou (502 etc.): tenta direto nesta chamada
      } catch {
        if (proxyState === 'unknown') proxyState = 'off'
      }
    }
    const res = await fetch(BASE + path)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    release()
  }
}

export async function api(path, { retries = 3 } = {}) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fetchJson(path)
      cache.set(path, { ts: Date.now(), data })
      return data
    } catch (err) {
      lastErr = err
      if (attempt < retries) await sleep(400 * Math.pow(2, attempt)) // 400, 800, 1600ms
    }
  }
  throw lastErr
}

export function clearCache() {
  cache.clear()
}
