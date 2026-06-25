// Backtesting do modelo de palpites.
//
// Para cada rodada R de um campeonato, recalcula a força dos times usando SÓ as
// rodadas anteriores (R-1 .. R-PAST_ROUNDS) — exatamente como o app faz ao vivo —
// e compara a previsão com o resultado real. Mede acerto do palpite sugerido,
// acerto do 1X2, e calibração das probabilidades (Brier / log-loss). Em seguida
// varre os parâmetros do modelo (decay, encolhimento, Dixon-Coles, forma) para
// indicar a combinação mais calibrada.
//
// Uso:
//   node scripts/backtest.mjs [season] [leagueId ...]
//   node scripts/backtest.mjs 2024 4351            # Brasileirão A 2024
//   node scripts/backtest.mjs 2024 4351 4328 4335  # + Premier + La Liga
//
// Sem rede (chave grátis bloqueada) o script avisa e sai.

import { api } from '../src/lib/api.js'
import { aggregateStrength } from '../src/lib/matches.js'
import { predict, bestPick } from '../src/lib/poisson.js'

const PAST_ROUNDS = 6 // mesma janela do app
const MAX_ROUNDS = 38 // teto de rodadas a tentar buscar

const season = process.argv[2] || '2024'
const leagueIds = process.argv.slice(3)
if (!leagueIds.length) leagueIds.push('4351') // Brasileirão Série A

// ── coleta: busca todas as rodadas de uma liga/temporada ──────────────────────
async function fetchRounds(leagueId) {
  const rounds = [] // rounds[r] = array de eventos da rodada r (1-based)
  let empties = 0
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    let events = []
    try {
      const d = await api(`eventsround.php?id=${leagueId}&r=${r}&s=${encodeURIComponent(season)}`)
      events = (d && d.events) || []
    } catch {
      events = []
    }
    rounds[r] = events
    if (!events.length) {
      if (++empties >= 3) break // 3 rodadas vazias seguidas → fim da temporada
    } else {
      empties = 0
    }
  }
  return rounds
}

// ── monta os jogos de teste (rodada R prevista a partir das anteriores) ───────
// Cada item: { leagueId, R, H, A, hs, as, prior } onde prior são as listas de
// eventos das rodadas anteriores (mais recente primeiro), já fixadas.
function buildTestSet(rounds, leagueId) {
  const tests = []
  const lastRound = rounds.length - 1
  for (let R = PAST_ROUNDS + 1; R <= lastRound; R++) {
    const played = (rounds[R] || []).filter(
      (e) => e.intHomeScore != null && e.intHomeScore !== '' && e.intAwayScore != null,
    )
    if (!played.length) continue
    const prior = []
    for (let r = R - 1; r >= Math.max(1, R - PAST_ROUNDS); r--) prior.push(rounds[r] || [])
    for (const e of played) {
      tests.push({
        leagueId,
        R,
        H: e.idHomeTeam,
        A: e.idAwayTeam,
        hs: +e.intHomeScore,
        as: +e.intAwayScore,
        prior,
      })
    }
  }
  return tests
}

// ── avaliação de um palpite (mesmos mercados do bestPick) ─────────────────────
function pickWon(key, hs, as) {
  const homeWin = hs > as, draw = hs === as, awayWin = as > hs
  const over = hs + as >= 3, btts = hs >= 1 && as >= 1
  switch (key) {
    case '1': return homeWin
    case 'X': return draw
    case '2': return awayWin
    case '1X': return homeWin || draw
    case '12': return homeWin || awayWin
    case 'X2': return draw || awayWin
    case 'O25': return over
    case 'U25': return !over
    case 'BTS': return btts
    case 'BTN': return !btts
    default: return false
  }
}

// ── roda o modelo sobre o conjunto de teste com um dado jogo de parâmetros ────
function evaluate(tests, opts) {
  const strOpts = { decay: opts.decay, shrinkK: opts.shrinkK }
  const prOpts = { rho: opts.rho, formW: opts.formW }
  // cache da agregação por (liga,R) — não depende do jogo, só dos parâmetros.
  const aggCache = new Map()

  let n = 0, hit1x2 = 0, pickHit = 0, pickP = 0, brier = 0, logloss = 0
  for (const t of tests) {
    const ck = `${t.leagueId}:${t.R}`
    let agg = aggCache.get(ck)
    if (!agg) {
      agg = aggregateStrength(t.prior, strOpts)
      aggCache.set(ck, agg)
    }
    const sh = agg.strength[t.H]
    const sa = agg.strength[t.A]
    if (!sh || !sa) continue // sem histórico dos dois lados → não previsível (como no app)

    const match = {
      leagueAvg: agg.leagueAvg,
      muHome: agg.muHome,
      muAway: agg.muAway,
      home: { name: t.H, short: t.H, ...sh, form: agg.form[t.H] || [] },
      away: { name: t.A, short: t.A, ...sa, form: agg.form[t.A] || [] },
    }
    const pr = predict(match, prOpts)
    const pick = bestPick(pr, match)

    const homeWin = t.hs > t.as, draw = t.hs === t.as
    const yH = homeWin ? 1 : 0, yD = draw ? 1 : 0, yA = !homeWin && !draw ? 1 : 0
    const pred = pr.pH >= pr.pD && pr.pH >= pr.pA ? 'H' : pr.pA >= pr.pD ? 'A' : 'D'
    const actual = homeWin ? 'H' : draw ? 'D' : 'A'

    n++
    if (pred === actual) hit1x2++
    if (pickWon(pick.key, t.hs, t.as)) pickHit++
    pickP += pick.p
    brier += (pr.pH - yH) ** 2 + (pr.pD - yD) ** 2 + (pr.pA - yA) ** 2
    const pAct = Math.max(1e-9, actual === 'H' ? pr.pH : actual === 'D' ? pr.pD : pr.pA)
    logloss += -Math.log(pAct)
  }
  return {
    n,
    acc1x2: hit1x2 / n,
    pickHit: pickHit / n,
    pickP: pickP / n,
    brier: brier / n,
    logloss: logloss / n,
  }
}

// ── baselines de referência (sem modelo) ──────────────────────────────────────
function baselines(tests) {
  let n = 0, homeWins = 0, draws = 0
  for (const t of tests) {
    n++
    if (t.hs > t.as) homeWins++
    else if (t.hs === t.as) draws++
  }
  return { n, homeRate: homeWins / n, drawRate: draws / n, awayRate: (n - homeWins - draws) / n }
}

const fmt = (x) => (x * 100).toFixed(1) + '%'
const f3 = (x) => x.toFixed(3)

async function main() {
  console.log(`\nBacktest — temporada ${season}, ligas: ${leagueIds.join(', ')}\n`)

  let tests = []
  for (const id of leagueIds) {
    process.stdout.write(`buscando liga ${id}… `)
    const rounds = await fetchRounds(id)
    const got = rounds.filter((r) => r && r.length).length
    const set = buildTestSet(rounds, id)
    console.log(`${got} rodadas, ${set.length} jogos de teste`)
    tests = tests.concat(set)
  }

  if (!tests.length) {
    console.log(
      '\nNenhum jogo coletado. Possíveis causas: temporada/ID errados, ou a chave grátis "3" ' +
        'bloqueou o IP (rate limit). Tente outra temporada: node scripts/backtest.mjs 2023 4351\n',
    )
    process.exit(1)
  }

  const base = baselines(tests)
  console.log(`\nAmostra: ${tests.length} jogos`)
  console.log(
    `Frequência real → casa ${fmt(base.homeRate)} · empate ${fmt(base.drawRate)} · fora ${fmt(base.awayRate)}`,
  )
  console.log(`Referências de log-loss: chute 1/3 = ${f3(Math.log(3))} · sempre o favorito de campo`)

  // parâmetros atuais (defaults do app, calibrados por este backtest)
  const current = { decay: 0.92, shrinkK: 6, rho: -0.06, formW: 0.18 }
  const cur = evaluate(tests, current)
  console.log(`\n── Parâmetros atuais ${JSON.stringify(current)} ──`)
  console.log(`  jogos previsíveis: ${cur.n}/${tests.length}`)
  console.log(`  acerto 1X2 (mais provável): ${fmt(cur.acc1x2)}`)
  console.log(`  acerto do palpite sugerido: ${fmt(cur.pickHit)} (prob. média ${fmt(cur.pickP)})`)
  console.log(`  Brier: ${f3(cur.brier)} · log-loss: ${f3(cur.logloss)} (menor = melhor)`)

  // ── varredura de parâmetros (calibração) ────────────────────────────────────
  const grid = {
    decay: [0.78, 0.85, 0.92],
    shrinkK: [2, 3.5, 6],
    rho: [0, -0.06, -0.12],
    formW: [0, 0.18, 0.3],
  }
  const combos = []
  for (const decay of grid.decay)
    for (const shrinkK of grid.shrinkK)
      for (const rho of grid.rho)
        for (const formW of grid.formW) {
          const m = evaluate(tests, { decay, shrinkK, rho, formW })
          combos.push({ decay, shrinkK, rho, formW, ...m })
        }

  const top = (arr, key, asc) =>
    [...arr].sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key])).slice(0, 8)

  console.log(`\n── Top 8 por log-loss (melhor calibração) ──`)
  for (const c of top(combos, 'logloss', true)) {
    console.log(
      `  ll ${f3(c.logloss)} | brier ${f3(c.brier)} | 1X2 ${fmt(c.acc1x2)} | palpite ${fmt(c.pickHit)} ` +
        `| decay ${c.decay} k ${c.shrinkK} rho ${c.rho} form ${c.formW}`,
    )
  }
  console.log(`\n── Top 8 por acerto do palpite sugerido ──`)
  for (const c of top(combos, 'pickHit', false)) {
    console.log(
      `  palpite ${fmt(c.pickHit)} | ll ${f3(c.logloss)} | 1X2 ${fmt(c.acc1x2)} ` +
        `| decay ${c.decay} k ${c.shrinkK} rho ${c.rho} form ${c.formW}`,
    )
  }
  console.log('')
}

main().catch((e) => {
  console.error('Erro no backtest:', e)
  process.exit(1)
})
