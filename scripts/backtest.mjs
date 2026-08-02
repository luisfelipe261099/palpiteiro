// Backtest do modelo de palpites contra resultados REAIS já disputados.
// Para cada rodada-alvo, calcula a força só com as rodadas ANTERIORES
// (exatamente como o app faria no dia do jogo) e compara a previsão com o
// placar real. Serve para calibrar os hiperparâmetros (decay, prior,
// profundidade, rho) com dados, em vez de no olho.
//
// Uso:  node scripts/backtest.mjs
// (usa a mesma chave/API do app; as respostas ficam no cache em memória,
//  então as variantes de parâmetros não geram novas requisições)
import fs from 'node:fs'
import path from 'node:path'
import { computeStrength } from '../src/lib/matches.js'
import { predict, bestPick } from '../src/lib/poisson.js'
import { api } from '../src/lib/api.js'

// cache em DISCO das respostas da API (rodadas passadas não mudam): permite
// re-rodar o backtest sem martelar a chave compartilhada.
const CACHE_DIR = path.join(process.cwd(), '.backtest-cache')
fs.mkdirSync(CACHE_DIR, { recursive: true })
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const key = Buffer.from(String(url)).toString('base64url').slice(0, 180)
  const file = path.join(CACHE_DIR, key + '.json')
  if (fs.existsSync(file)) {
    return new Response(fs.readFileSync(file, 'utf8'), { status: 200 })
  }
  const res = await realFetch(url, init)
  if (res.ok) {
    const text = await res.text()
    fs.writeFileSync(file, text)
    return new Response(text, { status: 200 })
  }
  return res
}

const SUITES = [
  { lg: { id: '4351', local: 'Série A' }, season: '2026', rounds: range(8, 21) },
  { lg: { id: '4404', local: 'Série B' }, season: '2026', rounds: range(8, 21) },
  { lg: { id: '4328', local: 'Premier' }, season: '2025-2026', rounds: range(8, 38) },
]

function range(a, b) {
  const out = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function finishedRound(lgId, season, r) {
  try {
    const d = await api(`eventsround.php?id=${lgId}&r=${r}&s=${encodeURIComponent(season)}`)
    return (d.events || []).filter(
      (e) => e.intHomeScore != null && e.intHomeScore !== '' && e.intAwayScore != null,
    )
  } catch {
    return []
  }
}

// monta os "casos de teste": para cada rodada-alvo, os jogos finalizados +
// a força calculada só com o passado (via computeStrength com opts).
async function buildCases() {
  const cases = [] // { lgId, season, round, events }
  for (const s of SUITES) {
    for (const r of s.rounds) {
      const events = await finishedRound(s.lg.id, s.season, r)
      if (events.length) cases.push({ lg: s.lg, season: s.season, round: r, events })
      await sleep(120) // gentileza com a chave compartilhada
    }
  }
  return cases
}

function evalVariant(name, cases, strengths, opts) {
  // métricas
  let n = 0
  let hit1x2 = 0 // argmax 1X2 correto
  let brier = 0 // brier multiclasse 1X2
  let pickN = 0, pickHit = 0, pickPsum = 0 // bestPick (com regra dupla chance)
  let ouN = 0, ouHit = 0, ouPsum = 0, ouReal = 0
  let bttsN = 0, bttsHit = 0, bttsPsum = 0, bttsReal = 0
  const buckets = new Map() // calibração do bestPick: faixa -> [hits, total, psum]

  for (const c of cases) {
    const st = strengths.get(`${c.lg.id}|${c.round}`)
    if (!st) continue
    const { strength, leagueAvg, homeAdv } = st
    for (const e of c.events) {
      const hs = strength[e.idHomeTeam]
      const as = strength[e.idAwayTeam]
      if (!hs || !as) continue
      const m = {
        leagueAvg,
        homeAdv: homeAdv || undefined,
        home: { name: e.strHomeTeam, short: e.strHomeTeam, att: hs.att, def: hs.def },
        away: { name: e.strAwayTeam, short: e.strAwayTeam, att: as.att, def: as.def },
      }
      const pr = predict(m, opts)
      const gh = +e.intHomeScore
      const ga = +e.intAwayScore
      const res = gh > ga ? '1' : gh === ga ? 'X' : '2'

      n++
      const top = pr.pH >= pr.pD && pr.pH >= pr.pA ? '1' : pr.pA >= pr.pD ? '2' : 'X'
      if (top === res) hit1x2++
      const oh = res === '1' ? 1 : 0
      const od = res === 'X' ? 1 : 0
      const oa = res === '2' ? 1 : 0
      brier += (pr.pH - oh) ** 2 + (pr.pD - od) ** 2 + (pr.pA - oa) ** 2

      const pick = bestPick(pr, m, opts.minWin)
      const hitPick =
        (pick.key === '1' && res === '1') ||
        (pick.key === '2' && res === '2') ||
        (pick.key === 'X' && res === 'X') ||
        (pick.key === '1X' && res !== '2') ||
        (pick.key === 'X2' && res !== '1') ||
        (pick.key === '12' && res !== 'X')
      pickN++
      pickPsum += pick.p
      if (hitPick) pickHit++
      const b = Math.min(0.9, Math.floor(pick.p * 10) / 10)
      if (!buckets.has(b)) buckets.set(b, [0, 0, 0])
      const bb = buckets.get(b)
      bb[1]++
      bb[2] += pick.p
      if (hitPick) bb[0]++

      ouN++
      const over = gh + ga >= 3
      ouPsum += pr.over25
      if (over) ouReal++
      if ((pr.over25 >= 0.5) === over) ouHit++

      bttsN++
      const both = gh > 0 && ga > 0
      bttsPsum += pr.btts
      if (both) bttsReal++
      if ((pr.btts >= 0.5) === both) bttsHit++
    }
  }

  const line = {
    name,
    n,
    'acc 1X2': pct(hit1x2 / n),
    brier: (brier / n).toFixed(4),
    'pick hit': pct(pickHit / pickN),
    'pick p̄': pct(pickPsum / pickN),
    'o/u hit': pct(ouHit / ouN),
    'ov p̄/real': `${pct(ouPsum / ouN)}/${pct(ouReal / ouN)}`,
    'btts hit': pct(bttsHit / bttsN),
    'bt p̄/real': `${pct(bttsPsum / bttsN)}/${pct(bttsReal / bttsN)}`,
  }
  return { line, buckets }
}

const pct = (x) => `${(100 * x).toFixed(1)}%`

async function main() {
  console.log('coletando rodadas…')
  const cases = await buildCases()
  const total = cases.reduce((a, c) => a + c.events.length, 0)
  console.log(`${cases.length} rodadas-alvo, ${total} jogos finalizados\n`)

  // variantes: 1 dimensão por vez a partir da base
  const variants = [
    ['antiga (p3, win.55)', { decay: 0.85, prior: 3, depth: 6, rho: -0.11, minWin: 0.55 }],
    ['p6 win.55', { decay: 0.85, prior: 6, depth: 6, rho: -0.11, minWin: 0.55 }],
    ['p6 win.60 (ATUAL)', { decay: 0.85, prior: 6, depth: 6, rho: -0.11, minWin: 0.6 }],
    ['p6 win.65', { decay: 0.85, prior: 6, depth: 6, rho: -0.11, minWin: 0.65 }],
  ]

  const rows = []
  let lastBuckets = null
  let bestName = null
  for (const [name, opts] of variants) {
    // força por (liga, rodada-alvo) com os opts da variante — as requisições
    // de rodadas já estão no cache do api.js, então isto é só CPU
    const strengths = new Map()
    for (const c of cases) {
      const key = `${c.lg.id}|${c.round}`
      if (!strengths.has(key)) {
        strengths.set(key, await computeStrength(c.lg, c.season, c.round, opts))
      }
    }
    const { line, buckets } = evalVariant(name, cases, strengths, opts)
    rows.push(line)
    const hitNum = parseFloat(line['pick hit'])
    if (!lastBuckets || hitNum > lastBuckets.hit) {
      lastBuckets = { hit: hitNum, name, buckets }
    }
  }

  console.table(rows)

  console.log(`\ncalibração do bestPick (${lastBuckets.name}): previsto × real`)
  const keys = [...lastBuckets.buckets.keys()].sort()
  for (const k of keys) {
    const [hits, tot, psum] = lastBuckets.buckets.get(k)
    console.log(
      `  p ${k.toFixed(1)}–${(k + 0.1).toFixed(1)}: previsto ${pct(psum / tot)} | real ${pct(hits / tot)} (${hits}/${tot})`,
    )
  }
}

main()
