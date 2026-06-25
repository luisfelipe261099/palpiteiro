// Camada de dados: monta os jogos reais a partir do TheSportsDB.
// Força ofensiva/defensiva e forma são calculadas dos RESULTADOS reais
// das últimas rodadas (a tabela da API gratuita vem truncada, mas os
// resultados das rodadas vêm completos).
import { api } from './api.js'
import { LEAGUES, MAX_LEAGUES_SHOWN, HOME_ADV } from './leagues.js'
import { abbr, colorFor, fmtTime } from './format.js'
import { natStrength, natStrengthKnown } from './nationalStrength.js'

// Quantas rodadas passadas alimentam a força (eventsround vem completo).
const PAST_ROUNDS = 6
// Recência: cada rodada mais antiga pesa 85% da anterior (jogo recente vale mais).
const RECENCY_DECAY = 0.85
// Encolhimento bayesiano: equivale a SHRINK_K jogos na média da liga. Com poucos
// jogos a força é puxada para 1.0 (média), evitando exageros de amostra pequena.
const SHRINK_K = 3.5

// índice id-da-liga -> metadados, para reconhecer os jogos vindos do
// endpoint global de "jogos do dia".
const LEAGUE_BY_ID = new Map(LEAGUES.map((lg) => [String(lg.id), lg]))

function pushForm(form, id, res) {
  if (!form[id]) form[id] = []
  if (form[id].length < 5) form[id].push(res)
}

// converte o timestamp (UTC) da API em Date local
function tsToDate(ts) {
  if (!ts) return null
  const iso = ts.replace(' ', 'T')
  const d = new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  return isNaN(d) ? null : d
}

// extrai o melhor timestamp disponível de um evento da API.
// strTimestamp pode ser null; nesse caso usa dateEvent + strTime como fallback.
// Quando o horário não é conhecido, usa 12:00:00 para evitar problemas de
// fuso horário nas comparações de janela (um jogo com data "amanhã" não seria
// excluído por cair antes de meia-noite UTC+0).
function eventTimestamp(e) {
  if (!e) return null
  if (e.strTimestamp) return e.strTimestamp
  if (!e.dateEvent) return null
  const time = e.strTime || '12:00:00'
  return `${e.dateEvent} ${time}`
}

// só mostra jogos de hoje e amanhã (janela de 2 dias)
const WINDOW_DAYS = 2
// copas/seleções (Copa do Mundo, Eurocopa, Mundial de Clubes, mata-matas
// europeus) são torneios concentrados e de alto interesse que começam numa
// data fixa. Mostramos seus próximos jogos com mais antecedência para que a
// Copa apareça mesmo faltando alguns dias para a estreia.
const CUP_LOOKAHEAD_DAYS = 10

function withinWindow(ts, days = WINDOW_DAYS) {
  const d = tsToDate(ts)
  if (!d) return false
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // hoje 00:00
  const end = new Date(start)
  end.setDate(end.getDate() + days) // exclui a partir de days dias depois, 00:00
  return d >= start && d < end
}

// uma competição é tratada como "copa" (janela ampliada) quando é de seleções
// (kind 'nation') ou está marcada com `cup: true` em leagues.js.
function isCupLeague(lg) {
  return lg.kind === 'nation' || lg.cup === true
}

// um jogo só é "futuro" (palpitável) enquanto ainda não tem placar.
function isUnplayed(e) {
  return e.intHomeScore == null || e.intHomeScore === ''
}

// datas (YYYY-MM-DD em UTC) que cobrem a janela local de hoje+amanhã.
// A janela local pode tocar até 3 datas UTC distintas conforme o fuso, então
// varremos de -1 a +2 dias para não perder jogos nas bordas.
function windowDates() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const set = new Set()
  for (let i = -1; i <= 2; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    set.add(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    )
  }
  return [...set]
}

// ratio com encolhimento bayesiano em direção a 1.0 (média do contexto).
// gf = gols ponderados, w = peso (jogos ponderados), base = média esperada
// daquele contexto (geral/casa/fora). Poucos jogos → ratio perto de 1.
function shrunkRatio(gf, w, base) {
  if (!base) return 1
  return (gf + SHRINK_K * base) / (w + SHRINK_K) / base
}

// limita um fator de força para evitar que o ajuste por adversário (divisão)
// exploda com valores extremos vindos de amostras pequenas.
function clampFactor(x) {
  return Math.min(1.8, Math.max(0.55, x))
}

// força ofensiva/defensiva (geral e por mando) + forma, a partir dos resultados
// reais das últimas rodadas (eventsround.php vem completo mesmo na chave grátis).
// Jogos recentes pesam mais (recência), a força é regularizada (encolhimento) e
// AJUSTADA pela qualidade do adversário enfrentado (gol contra defesa forte vale
// mais que contra defesa fraca) — extraindo melhor o histórico já disponível.
async function computeStrength(lg, season, round) {
  const games = [] // { H, A, hs, as, w }
  const all = {} // id -> { gf, ga, w } geral (gols brutos, p/ força de referência)
  const form = {}
  let lgHomeGoals = 0
  let lgAwayGoals = 0
  let lgW = 0

  if (!isNaN(round) && round > 1 && season) {
    const rounds = []
    for (let r = round - 1; r >= Math.max(1, round - PAST_ROUNDS); r--) rounds.push(r)
    const past = await Promise.all(
      rounds.map((r) =>
        api(`eventsround.php?id=${lg.id}&r=${r}&s=${encodeURIComponent(season)}`).catch(() => ({ events: [] })),
      ),
    )
    // rounds[0] é a rodada mais recente; idx maior = mais antiga = peso menor.
    past.forEach((pd, idx) => {
      const w = Math.pow(RECENCY_DECAY, idx)
      ;(pd.events || [])
        .filter((e) => e.intHomeScore != null && e.intAwayScore != null && e.intHomeScore !== '')
        .forEach((e) => {
          const hs = +e.intHomeScore
          const as = +e.intAwayScore
          const H = e.idHomeTeam
          const A = e.idAwayTeam
          if (!all[H]) all[H] = { gf: 0, ga: 0, w: 0 }
          if (!all[A]) all[A] = { gf: 0, ga: 0, w: 0 }
          all[H].gf += hs * w; all[H].ga += as * w; all[H].w += w
          all[A].gf += as * w; all[A].ga += hs * w; all[A].w += w
          lgHomeGoals += hs * w; lgAwayGoals += as * w; lgW += w
          games.push({ H, A, hs, as, w })
          pushForm(form, H, hs > as ? 'W' : hs === as ? 'D' : 'L')
          pushForm(form, A, as > hs ? 'W' : as === hs ? 'D' : 'L')
        })
    })
  }

  const leagueAvg = lgW ? (lgHomeGoals + lgAwayGoals) / (2 * lgW) : 1.35
  // médias de gols por jogo de mandante e visitante = vantagem de mando real.
  const muHome = lgW ? lgHomeGoals / lgW : leagueAvg * HOME_ADV
  const muAway = lgW ? lgAwayGoals / lgW : leagueAvg

  // força de referência (bruta) por time, p/ medir a qualidade do adversário.
  const rawAtt = {}
  const rawDef = {}
  Object.keys(all).forEach((id) => {
    rawAtt[id] = clampFactor(shrunkRatio(all[id].gf, all[id].w, leagueAvg))
    rawDef[id] = clampFactor(shrunkRatio(all[id].ga, all[id].w, leagueAvg))
  })

  // segundo passo: reagrega gols AJUSTADOS pela força do adversário.
  // marcar contra defesa forte (rawDef < 1) conta mais; sofrer de ataque fraco
  // (rawAtt < 1) conta mais. Adversário médio (fator 1) não muda nada.
  const home = {} // id -> { gf, ga, w } jogos em casa (ajustado)
  const away = {} // id -> { gf, ga, w } jogos fora (ajustado)
  const ensure = (m, id) => (m[id] || (m[id] = { gf: 0, ga: 0, w: 0 }))
  for (const { H, A, hs, as, w } of games) {
    const h = ensure(home, H)
    h.gf += (hs / rawDef[A]) * w; h.ga += (as / rawAtt[A]) * w; h.w += w
    const a = ensure(away, A)
    a.gf += (as / rawDef[H]) * w; a.ga += (hs / rawAtt[H]) * w; a.w += w
  }

  const strength = {}
  Object.keys(all).forEach((id) => {
    const H = home[id] || { gf: 0, ga: 0, w: 0 }
    const W = away[id] || { gf: 0, ga: 0, w: 0 }
    // geral (fallback) = casa + fora, já ajustado por adversário.
    const gAtt = H.gf + W.gf
    const gDef = H.ga + W.ga
    const gW = H.w + W.w
    strength[id] = {
      att: shrunkRatio(gAtt, gW, leagueAvg),
      def: shrunkRatio(gDef, gW, leagueAvg),
      attH: shrunkRatio(H.gf, H.w, muHome), // ataque jogando em casa
      defH: shrunkRatio(H.ga, H.w, muAway), // defesa jogando em casa (sofre vs muAway)
      attA: shrunkRatio(W.gf, W.w, muAway), // ataque jogando fora
      defA: shrunkRatio(W.ga, W.w, muHome), // defesa jogando fora (sofre vs muHome)
    }
  })
  return { strength, form, leagueAvg, muHome, muAway }
}

// normaliza uma força para o formato com mando (attH/defH/attA/defA). O
// histórico já vem completo; o fallback de ranking (seleções) só tem att/def
// gerais, então replicamos para casa e fora.
function withMando(s) {
  if (!s) return null
  if (s.attH != null) return s
  return { att: s.att, def: s.def, attH: s.att, defH: s.def, attA: s.att, defA: s.def }
}

// monta os cards de jogo a partir de uma lista de fixtures já filtrada.
function buildMatches(lg, fixtures, strength, form, leagueAvg, muHome, muAway) {
  const isNation = lg.kind === 'nation' // Copa do Mundo / Eurocopa
  return fixtures.map((e) => {
    // histórico no torneio tem prioridade; em competição de seleções sem
    // histórico, usa a força por ranking (proxy FIFA) como fallback.
    const hs = withMando(strength[e.idHomeTeam] || (isNation ? natStrength(e.strHomeTeam) : null))
    const as = withMando(strength[e.idAwayTeam] || (isNation ? natStrength(e.strAwayTeam) : null))
    // lastro "real" = histórico na competição OU ranking conhecido (seleções).
    // Sem lastro nos dois lados (ex.: amistoso entre seleções de base/pequenas),
    // a previsão é genérica: marcamos como preliminar para avisar na UI e manter
    // o jogo fora dos bilhetes do dia.
    const homeReal = !!strength[e.idHomeTeam] || (isNation && !!natStrengthKnown(e.strHomeTeam))
    const awayReal = !!strength[e.idAwayTeam] || (isNation && !!natStrengthKnown(e.strAwayTeam))
    return {
      id: `${lg.id}-${e.idEvent}`,
      league: lg.local,
      flag: lg.flag,
      leagueAvg,
      // médias de gols mandante/visitante (vantagem de mando real). Em jogo de
      // seleção (sede neutra) usa a média geral dos dois lados, sem mando.
      muHome: isNation ? leagueAvg : muHome,
      muAway: isNation ? leagueAvg : muAway,
      // só dá para prever com confiança se os dois times têm força estimada
      // (histórico na competição, ou ranking no caso de seleções).
      predictable: !!(hs && as),
      // previsão sem dado real por trás (não entra nos bilhetes do dia).
      preliminary: !homeReal && !awayReal,
      // jogo de seleção em sede neutra: sem vantagem de mando.
      homeAdv: isNation ? 1.0 : undefined,
      ts: eventTimestamp(e), // timestamp bruto p/ ordenar jogos/grupos por data
      time: fmtTime(eventTimestamp(e)),
      home: {
        name: e.strHomeTeam,
        short: abbr(e.strHomeTeam),
        badge: e.strHomeTeamBadge,
        color: colorFor(e.strHomeTeam),
        att: hs ? hs.att : 1,
        def: hs ? hs.def : 1,
        attH: hs ? hs.attH : 1,
        defH: hs ? hs.defH : 1,
        attA: hs ? hs.attA : 1,
        defA: hs ? hs.defA : 1,
        form: (form[e.idHomeTeam] || []).slice(0, 5),
      },
      away: {
        name: e.strAwayTeam,
        short: abbr(e.strAwayTeam),
        badge: e.strAwayTeamBadge,
        color: colorFor(e.strAwayTeam),
        att: as ? as.att : 1,
        def: as ? as.def : 1,
        attH: as ? as.attH : 1,
        defH: as ? as.defH : 1,
        attA: as ? as.attA : 1,
        defA: as ? as.defA : 1,
        form: (form[e.idAwayTeam] || []).slice(0, 5),
      },
    }
  })
}

// monta uma liga a partir das fixtures de hoje/amanhã já descobertas
// (caminho principal, via eventsday.php).
async function loadLeagueFromFixtures(lg, fixtures) {
  fixtures.sort((a, b) => (eventTimestamp(a) || '').localeCompare(eventTimestamp(b) || ''))
  const first = fixtures[0]
  const season = first.strSeason
  const round = parseInt(first.intRound, 10)
  const { strength, form, leagueAvg, muHome, muAway } = await computeStrength(lg, season, round)
  const matches = buildMatches(lg, fixtures, strength, form, leagueAvg, muHome, muAway)
  return { id: lg.id, name: lg.local, flag: lg.flag, matches }
}

// caminho de fallback: parte de um "próximo jogo" (eventsnextleague.php) e
// busca a rodada atual via eventsround.php.
async function loadLeagueFull(lg, nextEv) {
  const season = nextEv.strSeason
  const round = parseInt(nextEv.intRound, 10)
  const { strength, form, leagueAvg, muHome, muAway } = await computeStrength(lg, season, round)

  // jogos futuros da rodada atual (não jogados), só de hoje/amanhã
  let fixtures = []
  if (!isNaN(round)) {
    const rd = await api(`eventsround.php?id=${lg.id}&r=${round}&s=${encodeURIComponent(season)}`)
    fixtures = (rd.events || []).filter(isUnplayed)
  }
  fixtures = fixtures.filter((e) => withinWindow(eventTimestamp(e)))
  if (!fixtures.length && withinWindow(eventTimestamp(nextEv))) fixtures = [nextEv]
  fixtures.sort((a, b) => (eventTimestamp(a) || '').localeCompare(eventTimestamp(b) || ''))

  const matches = buildMatches(lg, fixtures, strength, form, leagueAvg, muHome, muAway)
  return { id: lg.id, name: lg.local, flag: lg.flag, matches }
}

// Descobre os jogos de hoje/amanhã das ligas conhecidas via eventsday.php.
// Esse endpoint NÃO vem truncado na chave gratuita e lista todos os jogos de
// futebol de uma data — bem mais confiável que eventsnextleague.php (que na
// chave "3" retorna só 1 evento e pode apontar para um jogo fora da janela).
// Retorna um Map id-da-liga -> { lg, fixtures }.
async function discoverViaEventsDay() {
  const dates = windowDates()
  const days = await Promise.all(
    dates.map((d) => api(`eventsday.php?d=${d}&s=Soccer`).catch(() => ({ events: [] }))),
  )
  const byLeague = new Map()
  const seen = new Set()
  for (const day of days) {
    for (const e of day.events || []) {
      const lg = LEAGUE_BY_ID.get(String(e.idLeague))
      if (!lg) continue
      if (!withinWindow(eventTimestamp(e))) continue
      if (!isUnplayed(e)) continue // só jogos ainda não realizados
      if (seen.has(e.idEvent)) continue
      seen.add(e.idEvent)
      if (!byLeague.has(lg.id)) byLeague.set(lg.id, { lg, fixtures: [] })
      byLeague.get(lg.id).fixtures.push(e)
    }
  }
  return byLeague
}

// Fallback: detecta ligas ativas via eventsnextleague.php (1 chamada cada).
async function loadViaNextLeague() {
  const checks = await Promise.all(
    LEAGUES.map((lg) =>
      api(`eventsnextleague.php?id=${lg.id}`)
        .then((d) => {
          const events = (d && d.events) || []
          const ev = events.find((e) => withinWindow(eventTimestamp(e))) || null
          return { lg, ev }
        })
        .catch(() => ({ lg, ev: null })),
    ),
  )
  // só ligas com o próximo jogo em até 2 dias (hoje/amanhã)
  const active = checks.filter((c) => c.ev && withinWindow(eventTimestamp(c.ev))).slice(0, MAX_LEAGUES_SHOWN)

  const groups = []
  for (const c of active) {
    try {
      const g = await loadLeagueFull(c.lg, c.ev)
      if (g && g.matches.length) groups.push(g)
    } catch {
      /* ignora liga que falhou */
    }
  }
  return groups
}

// Descoberta de copa com janela ampliada: parte do próximo jogo da competição
// (eventsnextleague — basta 1 evento para saber temporada/rodada) e carrega a
// rodada inteira via eventsround.php (não truncado), filtrando para a janela
// ampliada de copas. Assim a Copa do Mundo aparece mesmo faltando dias para a
// estreia, com TODOS os jogos da rodada, não só o de abertura.
async function discoverCupWide(lg) {
  let nextEv = null
  try {
    const d = await api(`eventsnextleague.php?id=${lg.id}`)
    const events = (d && d.events) || []
    nextEv =
      events.find((e) => isUnplayed(e) && withinWindow(eventTimestamp(e), CUP_LOOKAHEAD_DAYS)) || null
  } catch {
    nextEv = null
  }
  if (!nextEv) return null

  const season = nextEv.strSeason
  const round = parseInt(nextEv.intRound, 10)
  let fixtures = []
  if (!isNaN(round) && season) {
    try {
      const rd = await api(`eventsround.php?id=${lg.id}&r=${round}&s=${encodeURIComponent(season)}`)
      fixtures = (rd.events || []).filter(isUnplayed)
    } catch {
      fixtures = []
    }
  }
  fixtures = fixtures.filter((e) => withinWindow(eventTimestamp(e), CUP_LOOKAHEAD_DAYS))
  // sem rodada utilizável: ao menos mostra o próximo jogo conhecido.
  if (!fixtures.length && withinWindow(eventTimestamp(nextEv), CUP_LOOKAHEAD_DAYS)) fixtures = [nextEv]
  return fixtures.length ? { lg, fixtures } : null
}

// Carrega todas as ligas ativas. Retorna { groups, error }.
export async function loadAllLeagues() {
  const byLeague = new Map()

  // 1) jogos de hoje/amanhã de todas as ligas (endpoint não truncado)
  try {
    for (const [id, v] of await discoverViaEventsDay()) byLeague.set(id, v)
  } catch {
    /* segue para os outros caminhos */
  }

  // 2) copas/seleções: janela ampliada (a Copa só começa numa data fixa, então
  //    mostramos seus próximos jogos com mais antecedência). Sequencial para
  //    não estourar o rate-limit da chave gratuita; competições em recesso
  //    saem cedo (sem jogo na janela) sem custo extra.
  for (const lg of LEAGUES.filter(isCupLeague)) {
    let res = null
    try {
      res = await discoverCupWide(lg)
    } catch {
      res = null
    }
    if (!res) continue
    const existing = byLeague.get(lg.id)
    if (existing) {
      const seen = new Set(existing.fixtures.map((e) => e.idEvent))
      for (const e of res.fixtures) if (!seen.has(e.idEvent)) existing.fixtures.push(e)
    } else {
      byLeague.set(lg.id, res)
    }
  }

  let groups = []
  if (byLeague.size) {
    // respeita a ordem de prioridade de LEAGUES (copas primeiro) e limita a
    // carga para não estourar o rate-limit da chave gratuita.
    const active = LEAGUES.map((lg) => byLeague.get(lg.id))
      .filter(Boolean)
      .slice(0, MAX_LEAGUES_SHOWN)
    for (const { lg, fixtures } of active) {
      try {
        const g = await loadLeagueFromFixtures(lg, fixtures)
        if (g && g.matches.length) groups.push(g)
      } catch {
        /* ignora liga que falhou */
      }
    }
  }

  // 3) fallback: se nada foi descoberto, usa eventsnextleague
  if (!groups.length) {
    try {
      groups = await loadViaNextLeague()
    } catch {
      groups = []
    }
  }

  if (!groups.length) {
    return {
      groups: [],
      error: 'Sem jogos para hoje ou amanhã no momento. Volte mais perto da próxima rodada.',
    }
  }

  // ordena os grupos pelo jogo mais cedo: assim a liga com jogos de HOJE aparece
  // primeiro (ex.: amistosos de hoje antes da Copa do Mundo, que começa dias depois).
  const earliestMs = (g) => {
    let min = Infinity
    for (const m of g.matches) {
      const d = tsToDate(m.ts)
      if (d) min = Math.min(min, d.getTime())
    }
    return min
  }
  groups.sort((a, b) => earliestMs(a) - earliestMs(b))

  return { groups, error: null }
}
