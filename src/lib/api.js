// Cliente do TheSportsDB com cache em memória + retry/backoff.
// A chave gratuita é compartilhada e tem limite; o backoff evita
// falhas intermitentes sob rajada de requisições.
//
// ATENÇÃO à escolha da chave: em ago/2026 a chave pública "3" passou a
// TRUNCAR o eventsround.php em ~5 eventos (uma rodada da Série A tem 10),
// o que quebrava força/forma e esvaziava os bilhetes. A chave pública
// "123" retorna a rodada COMPLETA — é o novo padrão.
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
const KEY = env.VITE_TSDB_KEY || '123'
export const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}/`

const cache = new Map() // path -> { ts, data }
const CACHE_TTL = 5 * 60 * 1000 // 5 min

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function api(path, { retries = 3 } = {}) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(BASE + path)
      if (res.status === 429 || res.status >= 500) {
        // rate-limited / servidor instável: espera e tenta de novo
        throw new Error(`HTTP ${res.status}`)
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
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
