// Função serverless (Vercel) que guarda/serve os códigos de aposta (booking
// codes) da Betano para os "Bilhetes do dia".
//
//   GET  /api/bilhetes?date=YYYY-MM-DD   -> { date, codes: { safe, mid, risk } }  (público)
//   POST /api/bilhetes                   -> salva (exige header x-admin-secret)
//        body: { date: 'YYYY-MM-DD', codes: { safe, mid, risk } }
//
// Armazenamento: Redis (Upstash) — a antiga "Vercel KV" foi migrada para
// Upstash em dez/2024. Instale a integração "Upstash for Redis" no Marketplace
// da Vercel (ela injeta KV_REST_API_URL / KV_REST_API_TOKEN) e defina a env
// ADMIN_SECRET com a senha do painel de admin.
import { Redis } from '@upstash/redis'

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const redis = URL && TOKEN ? new Redis({ url: URL, token: TOKEN }) : null

const TYPES = ['safe', 'mid', 'risk']
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const keyFor = (date) => `bilhetes:${date}`

export default async function handler(req, res) {
  if (!redis) {
    return res
      .status(500)
      .json({ error: 'Redis não configurado. Instale a integração Upstash Redis na Vercel.' })
  }

  if (req.method === 'GET') {
    const date = req.query.date
    if (!isDate(date)) return res.status(400).json({ error: 'data inválida (use YYYY-MM-DD)' })
    const codes = (await redis.get(keyFor(date))) || {}
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ date, codes })
  }

  if (req.method === 'POST') {
    const secret = req.headers['x-admin-secret'] || (req.body && req.body.secret)
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'não autorizado' })
    }
    const { date, codes } = req.body || {}
    if (!isDate(date) || !codes || typeof codes !== 'object') {
      return res.status(400).json({ error: 'payload inválido' })
    }
    const clean = {}
    for (const t of TYPES) {
      const v = (codes[t] || '').toString().trim().toUpperCase()
      if (v) clean[t] = v
    }
    // expira em 3 dias para limpar códigos antigos automaticamente
    await redis.set(keyFor(date), clean, { ex: 60 * 60 * 24 * 3 })
    return res.status(200).json({ date, codes: clean })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'método não permitido' })
}
