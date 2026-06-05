// Camada de dados: monta os jogos reais a partir do TheSportsDB.
// Força ofensiva/defensiva e forma são calculadas dos RESULTADOS reais
// das últimas rodadas (a tabela da API gratuita vem truncada, mas os
// resultados das rodadas vêm completos).
import { api } from './api.js'
import { LEAGUES, MAX_LEAGUES_SHOWN } from './leagues.js'
import { abbr, colorFor, fmtTime } from './format.js'
import { natStrength } from './nationalStrength.js'

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

async function loadLeagueFull(lg, nextEv) {
  const season = nextEv.strSeason
  const round = parseInt(nextEv.intRound, 10)
  const isNation = lg.kind === 'nation' // Copa do Mundo / Eurocopa

  // 1) estatísticas (att/def) + forma a partir dos resultados reais
  const stat = {}
  const form = {}
  let totGoals = 0
  let totTeamGames = 0

  if (!isNaN(round) && round > 1) {
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

  // 2) jogos futuros da rodada atual (não jogados), só de hoje/amanhã
  let fixtures = []
  if (!isNaN(round)) {
    const rd = await api(`eventsround.php?id=${lg.id}&r=${round}&s=${encodeURIComponent(season)}`)
    fixtures = (rd.events || []).filter((e) => e.intHomeScore == null || e.intHomeScore === '')
  }
  fixtures = fixtures.filter((e) => withinWindow(e.strTimestamp))
  if (!fixtures.length && withinWindow(nextEv.strTimestamp)) fixtures = [nextEv]
  fixtures.sort((a, b) => (a.strTimestamp || '').localeCompare(b.strTimestamp || ''))

  const matches = fixtures.map((e) => {
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
      time: fmtTime(e.strTimestamp),
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

  return { id: lg.id, name: lg.local, flag: lg.flag, matches }
}

// Carrega todas as ligas ativas. Retorna { groups, error }.
export async function loadAllLeagues() {
  // detecta ligas ativas (1 chamada cada, em paralelo)
  const checks = await Promise.all(
    LEAGUES.map((lg) =>
      api(`eventsnextleague.php?id=${lg.id}`)
        .then((d) => ({ lg, ev: (d && d.events && d.events[0]) || null }))
        .catch(() => ({ lg, ev: null })),
    ),
  )
  // só ligas com o próximo jogo em até 2 dias (hoje/amanhã) — isso aplica a
  // janela de datas E evita carregar ligas distantes (bem mais rápido).
  const active = checks.filter((c) => c.ev && withinWindow(c.ev.strTimestamp)).slice(0, MAX_LEAGUES_SHOWN)

  // sequencial p/ não estourar o rate-limit da chave gratuita (já são
  // poucas ligas após o filtro de data).
  const groups = []
  for (const c of active) {
    try {
      const g = await loadLeagueFull(c.lg, c.ev)
      if (g && g.matches.length) groups.push(g)
    } catch {
      /* ignora liga que falhou */
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
