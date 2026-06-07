// Camada de dados: monta os jogos reais a partir do TheSportsDB.
// Força ofensiva/defensiva e forma são calculadas dos RESULTADOS reais
// das últimas rodadas (a tabela da API gratuita vem truncada, mas os
// resultados das rodadas vêm completos).
import { api } from './api.js'
import { LEAGUES, MAX_LEAGUES_SHOWN } from './leagues.js'
import { abbr, colorFor, fmtTime } from './format.js'
import { natStrength } from './nationalStrength.js'

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
function withinWindow(ts) {
  const d = tsToDate(ts)
  if (!d) return false
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // hoje 00:00
  const end = new Date(start)
  end.setDate(end.getDate() + 2) // exclui a partir de depois de amanhã 00:00
  return d >= start && d < end
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

// força ofensiva/defensiva + forma a partir dos resultados reais das últimas
// rodadas (eventsround.php vem completo mesmo na chave gratuita).
async function computeStrength(lg, season, round) {
  const stat = {}
  const form = {}
  let totGoals = 0
  let totTeamGames = 0

  if (!isNaN(round) && round > 1 && season) {
    const rounds = []
    for (let r = round - 1; r >= Math.max(1, round - 6); r--) rounds.push(r)
    const past = await Promise.all(
      rounds.map((r) =>
        api(`eventsround.php?id=${lg.id}&r=${r}&s=${encodeURIComponent(season)}`).catch(() => ({ events: [] })),
      ),
    )
    past.forEach((pd) => {
      ;(pd.events || [])
        .filter((e) => e.intHomeScore != null && e.intAwayScore != null && e.intHomeScore !== '')
        .forEach((e) => {
          const hs = +e.intHomeScore
          const as = +e.intAwayScore
          const H = e.idHomeTeam
          const A = e.idAwayTeam
          if (!stat[H]) stat[H] = { gf: 0, ga: 0, g: 0 }
          if (!stat[A]) stat[A] = { gf: 0, ga: 0, g: 0 }
          stat[H].gf += hs; stat[H].ga += as; stat[H].g++
          stat[A].gf += as; stat[A].ga += hs; stat[A].g++
          totGoals += hs + as
          totTeamGames += 2
          pushForm(form, H, hs > as ? 'W' : hs === as ? 'D' : 'L')
          pushForm(form, A, as > hs ? 'W' : as === hs ? 'D' : 'L')
        })
    })
  }

  const leagueAvg = totTeamGames ? totGoals / totTeamGames : 1.35
  const strength = {}
  Object.keys(stat).forEach((id) => {
    const s = stat[id]
    const g = Math.max(1, s.g)
    strength[id] = { att: s.gf / g / leagueAvg || 1, def: s.ga / g / leagueAvg || 1 }
  })
  return { strength, form, leagueAvg }
}

// monta os cards de jogo a partir de uma lista de fixtures já filtrada.
function buildMatches(lg, fixtures, strength, form, leagueAvg) {
  const isNation = lg.kind === 'nation' // Copa do Mundo / Eurocopa
  return fixtures.map((e) => {
    // histórico no torneio tem prioridade; em competição de seleções sem
    // histórico, usa a força por ranking (proxy FIFA) como fallback.
    const hs = strength[e.idHomeTeam] || (isNation ? natStrength(e.strHomeTeam) : null)
    const as = strength[e.idAwayTeam] || (isNation ? natStrength(e.strAwayTeam) : null)
    return {
      id: `${lg.id}-${e.idEvent}`,
      league: lg.local,
      flag: lg.flag,
      leagueAvg,
      // só dá para prever com confiança se os dois times têm força estimada
      // (histórico na competição, ou ranking no caso de seleções).
      predictable: !!(hs && as),
      // jogo de seleção em sede neutra: sem vantagem de mando.
      homeAdv: isNation ? 1.0 : undefined,
      time: fmtTime(eventTimestamp(e)),
      home: {
        name: e.strHomeTeam,
        short: abbr(e.strHomeTeam),
        badge: e.strHomeTeamBadge,
        color: colorFor(e.strHomeTeam),
        att: hs ? hs.att : 1,
        def: hs ? hs.def : 1,
        form: (form[e.idHomeTeam] || []).slice(0, 5),
      },
      away: {
        name: e.strAwayTeam,
        short: abbr(e.strAwayTeam),
        badge: e.strAwayTeamBadge,
        color: colorFor(e.strAwayTeam),
        att: as ? as.att : 1,
        def: as ? as.def : 1,
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
  const { strength, form, leagueAvg } = await computeStrength(lg, season, round)
  const matches = buildMatches(lg, fixtures, strength, form, leagueAvg)
  return { id: lg.id, name: lg.local, flag: lg.flag, matches }
}

// caminho de fallback: parte de um "próximo jogo" (eventsnextleague.php) e
// busca a rodada atual via eventsround.php.
async function loadLeagueFull(lg, nextEv) {
  const season = nextEv.strSeason
  const round = parseInt(nextEv.intRound, 10)
  const { strength, form, leagueAvg } = await computeStrength(lg, season, round)

  // jogos futuros da rodada atual (não jogados), só de hoje/amanhã
  let fixtures = []
  if (!isNaN(round)) {
    const rd = await api(`eventsround.php?id=${lg.id}&r=${round}&s=${encodeURIComponent(season)}`)
    fixtures = (rd.events || []).filter(isUnplayed)
  }
  fixtures = fixtures.filter((e) => withinWindow(eventTimestamp(e)))
  if (!fixtures.length && withinWindow(eventTimestamp(nextEv))) fixtures = [nextEv]
  fixtures.sort((a, b) => (eventTimestamp(a) || '').localeCompare(eventTimestamp(b) || ''))

  const matches = buildMatches(lg, fixtures, strength, form, leagueAvg)
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

// Carrega todas as ligas ativas. Retorna { groups, error }.
export async function loadAllLeagues() {
  // 1) caminho principal: jogos do dia (endpoint não truncado)
  let byLeague = new Map()
  try {
    byLeague = await discoverViaEventsDay()
  } catch {
    byLeague = new Map()
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

  // 2) fallback: se eventsday não trouxe nada, usa eventsnextleague
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
  return { groups, error: null }
}
