// Camada de dados: monta os jogos reais a partir do TheSportsDB.
// Força ofensiva/defensiva e forma são calculadas dos RESULTADOS reais
// das últimas rodadas (a tabela da API gratuita vem truncada, mas os
// resultados das rodadas vêm completos).
import { api } from './api.js'
import { LEAGUES, MAX_LEAGUES_SHOWN } from './leagues.js'
import { abbr, colorFor, fmtTime } from './format.js'

function pushForm(form, id, res) {
  if (!form[id]) form[id] = []
  if (form[id].length < 5) form[id].push(res)
}

async function loadLeagueFull(lg, nextEv) {
  const season = nextEv.strSeason
  const round = parseInt(nextEv.intRound, 10)

  // 1) estatísticas (att/def) + forma a partir dos resultados reais
  const stat = {}
  const form = {}
  let totGoals = 0
  let totTeamGames = 0

  if (!isNaN(round) && round > 1) {
    const rounds = []
    for (let r = round - 1; r >= Math.max(1, round - 10); r--) rounds.push(r)
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

  // 2) jogos futuros da rodada atual (não jogados)
  let fixtures = []
  if (!isNaN(round)) {
    const rd = await api(`eventsround.php?id=${lg.id}&r=${round}&s=${encodeURIComponent(season)}`)
    fixtures = (rd.events || []).filter((e) => e.intHomeScore == null || e.intHomeScore === '')
  }
  if (!fixtures.length) fixtures = [nextEv]
  fixtures.sort((a, b) => (a.strTimestamp || '').localeCompare(b.strTimestamp || ''))

  const matches = fixtures.map((e) => {
    const hs = strength[e.idHomeTeam]
    const as = strength[e.idAwayTeam]
    return {
      id: `${lg.id}-${e.idEvent}`,
      league: lg.local,
      flag: lg.flag,
      leagueAvg,
      // só dá para prever com confiança se os dois times têm histórico
      // recente na competição (ex.: rodada 1 de copa ainda não tem).
      predictable: !!(hs && as),
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
  const active = checks.filter((c) => c.ev).slice(0, MAX_LEAGUES_SHOWN)

  const groups = []
  for (const c of active) {
    // sequencial p/ respeitar rate-limit
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
      error: 'Nenhuma liga com jogos futuros disponível no momento (temporadas podem estar em recesso).',
    }
  }
  return { groups, error: null }
}
