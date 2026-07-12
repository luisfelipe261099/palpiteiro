// Camada de dados: monta os jogos reais a partir do TheSportsDB.
// Força ofensiva/defensiva e forma são calculadas dos RESULTADOS reais
// das últimas rodadas (a tabela da API gratuita vem truncada, mas os
// resultados das rodadas vêm completos).
import { api } from './api.js'
import { LEAGUES, MAX_LEAGUES_SHOWN } from './leagues.js'
import { abbr, colorFor, fmtTime } from './format.js'
import { natStrength, natStrengthKnown } from './nationalStrength.js'

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

// o evento é de HOJE (data local)?
function isTodayLocal(e) {
  const d = tsToDate(eventTimestamp(e))
  if (!d) return false
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  )
}

// eventos que o app carrega: futuros (para palpites) e também os de HOJE já
// iniciados/encerrados — a aba Ao Vivo acompanha placar e resultado do dia.
// (Os iniciados ficam com `started: true` e não entram em palpites/bilhetes.)
function keepEvent(e) {
  return isUnplayed(e) || isTodayLocal(e)
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

// Códigos de rodada que o TheSportsDB usa para o mata-mata de copas
// (verificados na Copa 2026: 125 = quartas, 150 = semi; 160/200 reservados
// para disputa de 3º lugar e final).
const KNOCKOUT_ROUNDS = [125, 150, 160, 200]

// rodadas com resultados relevantes para calcular força/forma, da mais
// recente para a mais antiga (a ordem importa: a forma usa os 5 primeiros
// resultados encontrados). Em rodada normal, as ~6 anteriores; no mata-mata
// (códigos especiais tipo 125), as fases eliminatórias até a atual + a fase
// de grupos (3..1) — senão buscaríamos rodadas 124, 123… que não existem.
// Incluir a rodada atual é seguro (só resultados finalizados contam) e pega
// os confrontos da fase já disputados.
function pastRounds(round) {
  if (KNOCKOUT_ROUNDS.includes(round)) {
    return [...KNOCKOUT_ROUNDS.filter((r) => r <= round).reverse(), 3, 2, 1]
  }
  const rounds = []
  for (let r = round - 1; r >= Math.max(1, round - 6); r--) rounds.push(r)
  return rounds
}

// peso das rodadas por idade (mais recente pesa mais) e "jogos virtuais" do
// prior bayesiano: com ~6 jogos de amostra a força bruta é ruidosa, então
// cada time começa com PRIOR_GAMES jogos fictícios na média da liga e os
// resultados reais puxam a estimativa a partir daí (encolhimento).
const ROUND_DECAY = 0.85
const PRIOR_GAMES = 3

// força ofensiva/defensiva + forma a partir dos resultados reais das últimas
// rodadas (eventsround.php vem completo mesmo na chave gratuita).
async function computeStrength(lg, season, round) {
  const stat = {}
  const form = {}
  let totGoals = 0
  let totTeamGames = 0
  let homeGoals = 0
  let awayGoals = 0

  if (!isNaN(round) && round > 1 && season) {
    const rounds = pastRounds(round)
    const past = await Promise.all(
      rounds.map((r) =>
        api(`eventsround.php?id=${lg.id}&r=${r}&s=${encodeURIComponent(season)}`).catch(() => ({ events: [] })),
      ),
    )
    past.forEach((pd, ri) => {
      const w = Math.pow(ROUND_DECAY, ri) // rodada mais recente pesa mais
      ;(pd.events || [])
        .filter((e) => e.intHomeScore != null && e.intAwayScore != null && e.intHomeScore !== '')
        .forEach((e) => {
          const hs = +e.intHomeScore
          const as = +e.intAwayScore
          const H = e.idHomeTeam
          const A = e.idAwayTeam
          if (!stat[H]) stat[H] = { gf: 0, ga: 0, g: 0, n: 0 }
          if (!stat[A]) stat[A] = { gf: 0, ga: 0, g: 0, n: 0 }
          stat[H].gf += hs * w; stat[H].ga += as * w; stat[H].g += w; stat[H].n++
          stat[A].gf += as * w; stat[A].ga += hs * w; stat[A].g += w; stat[A].n++
          totGoals += (hs + as) * w
          totTeamGames += 2 * w
          homeGoals += hs * w
          awayGoals += as * w
          pushForm(form, H, hs > as ? 'W' : hs === as ? 'D' : 'L')
          pushForm(form, A, as > hs ? 'W' : as === hs ? 'D' : 'L')
        })
    })
  }

  const leagueAvg = totTeamGames ? totGoals / totTeamGames : 1.35
  const strength = {}
  Object.keys(stat).forEach((id) => {
    const s = stat[id]
    // encolhimento bayesiano: (gols reais + prior na média) / (jogos + prior)
    const att = (s.gf + PRIOR_GAMES * leagueAvg) / (s.g + PRIOR_GAMES) / leagueAvg
    const def = (s.ga + PRIOR_GAMES * leagueAvg) / (s.g + PRIOR_GAMES) / leagueAvg
    strength[id] = { att, def, n: s.n }
  })

  // vantagem de mando medida na própria amostra (gols do mandante / visitante),
  // limitada a uma faixa plausível; sem amostra usa o fator padrão da liga.
  const homeAdv =
    awayGoals > 0 && totTeamGames >= 20 ? Math.min(1.3, Math.max(1.02, homeGoals / awayGoals)) : null

  return { strength, form, leagueAvg, homeAdv }
}

// força final de um time: em ligas de clubes é o histórico (já encolhido);
// em competições de seleções, MISTURA histórico no torneio com o ranking
// (proxy FIFA), pesando o histórico pelo tamanho da amostra — com 1-2 jogos
// o ranking ainda domina, com 5+ jogos o torneio fala mais alto.
function teamStrength(hist, name, isNation) {
  const rank = isNation ? natStrength(name) : null
  if (hist && rank) {
    const w = hist.n / (hist.n + 3)
    return { att: w * hist.att + (1 - w) * rank.att, def: w * hist.def + (1 - w) * rank.def, n: hist.n }
  }
  return hist || rank
}

// confiança dos dados do jogo (0..1): quantos jogos reais sustentam a
// previsão de cada lado; ranking conhecido de seleção vale meia confiança.
function matchConfidence(hist, name, isNation) {
  if (hist) return Math.min(1, hist.n / 6)
  if (isNation && natStrengthKnown(name)) return 0.5
  return 0
}

// monta os cards de jogo a partir de uma lista de fixtures já filtrada.
function buildMatches(lg, fixtures, strength, form, leagueAvg, homeAdv) {
  const isNation = lg.kind === 'nation' // Copa do Mundo / Eurocopa
  return fixtures.map((e) => {
    const hs = teamStrength(strength[e.idHomeTeam], e.strHomeTeam, isNation)
    const as = teamStrength(strength[e.idAwayTeam], e.strAwayTeam, isNation)
    // lastro "real" = histórico na competição OU ranking conhecido (seleções).
    // Sem lastro nos dois lados (ex.: amistoso entre seleções de base/pequenas),
    // a previsão é genérica: marcamos como preliminar para avisar na UI e manter
    // o jogo fora dos bilhetes do dia.
    const homeReal = !!strength[e.idHomeTeam] || (isNation && !!natStrengthKnown(e.strHomeTeam))
    const awayReal = !!strength[e.idAwayTeam] || (isNation && !!natStrengthKnown(e.strAwayTeam))
    const conf = Math.min(
      matchConfidence(strength[e.idHomeTeam], e.strHomeTeam, isNation),
      matchConfidence(strength[e.idAwayTeam], e.strAwayTeam, isNation),
    )
    return {
      id: `${lg.id}-${e.idEvent}`,
      eventId: e.idEvent, // id bruto na API (p/ consultar placar ao vivo)
      // já começou/terminou (tem placar): aparece só na aba Ao Vivo,
      // fora das Partidas e dos bilhetes
      started: !isUnplayed(e),
      league: lg.local,
      flag: lg.flag,
      leagueAvg,
      // só dá para prever com confiança se os dois times têm força estimada
      // (histórico na competição, ou ranking no caso de seleções).
      predictable: !!(hs && as),
      // previsão sem dado real por trás (não entra nos bilhetes do dia).
      preliminary: !homeReal && !awayReal,
      // 0..1: quantos jogos reais sustentam a previsão (prioriza palpites
      // com mais lastro nos bilhetes e sinaliza a confiança na UI)
      conf,
      // jogo de seleção em sede neutra: sem vantagem de mando; em liga,
      // usa o mando medido na amostra da própria competição.
      homeAdv: isNation ? 1.0 : homeAdv || undefined,
      ts: eventTimestamp(e), // timestamp bruto p/ ordenar jogos/grupos por data
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
  const { strength, form, leagueAvg, homeAdv } = await computeStrength(lg, season, round)
  const matches = buildMatches(lg, fixtures, strength, form, leagueAvg, homeAdv)
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
      if (!keepEvent(e)) continue // futuros + jogos de hoje (p/ Ao Vivo)
      if (seen.has(e.idEvent)) continue
      seen.add(e.idEvent)
      if (!byLeague.has(lg.id)) byLeague.set(lg.id, { lg, fixtures: [] })
      byLeague.get(lg.id).fixtures.push(e)
    }
  }
  return byLeague
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
      // keepEvent: o único evento retornado pode ser o jogo EM ANDAMENTO —
      // ainda serve de âncora (temporada/rodada) p/ carregar a rodada toda
      events.find((e) => keepEvent(e) && withinWindow(eventTimestamp(e), CUP_LOOKAHEAD_DAYS)) || null
  } catch {
    nextEv = null
  }
  if (!nextEv) return null

  const season = nextEv.strSeason
  const round = parseInt(nextEv.intRound, 10)
  let fixtures = []
  if (!isNaN(round) && season) {
    // no mata-mata busca TODAS as fases (quartas, semi, 3º lugar, final):
    // o "próximo jogo" âncora pode apontar para uma fase à frente enquanto
    // ainda há jogos da fase anterior por disputar (ex.: âncora na semi com
    // quartas em andamento) — filtrar por >= rodada da âncora perderia jogos.
    const rounds = KNOCKOUT_ROUNDS.includes(round) ? KNOCKOUT_ROUNDS : [round]
    for (const r of rounds) {
      try {
        const rd = await api(`eventsround.php?id=${lg.id}&r=${r}&s=${encodeURIComponent(season)}`)
        fixtures.push(...(rd.events || []).filter(keepEvent))
      } catch {
        /* fase sem dados ainda: segue para a próxima */
      }
    }
  }
  fixtures = fixtures.filter((e) => withinWindow(eventTimestamp(e), CUP_LOOKAHEAD_DAYS))
  // sem rodada utilizável: ao menos mostra o próximo jogo conhecido.
  if (!fixtures.length && withinWindow(eventTimestamp(nextEv), CUP_LOOKAHEAD_DAYS)) fixtures = [nextEv]
  return fixtures.length ? { lg, fixtures } : null
}

// Descobre os jogos de hoje/amanhã de uma liga nacional via eventsnextleague +
// eventsround. Necessário porque o eventsday.php da chave gratuita passou a
// vir truncado (só ~3 eventos/dia), deixando de listar as ligas conhecidas.
async function discoverLeagueViaNext(lg) {
  let ev = null
  try {
    const d = await api(`eventsnextleague.php?id=${lg.id}`)
    const events = (d && d.events) || []
    ev = events.find((e) => keepEvent(e) && withinWindow(eventTimestamp(e))) || null
  } catch {
    ev = null
  }
  if (!ev) return null

  const season = ev.strSeason
  const round = parseInt(ev.intRound, 10)
  let fixtures = []
  if (!isNaN(round) && season) {
    try {
      const rd = await api(`eventsround.php?id=${lg.id}&r=${round}&s=${encodeURIComponent(season)}`)
      fixtures = (rd.events || []).filter(keepEvent).filter((e) => withinWindow(eventTimestamp(e)))
    } catch {
      fixtures = []
    }
  }
  if (!fixtures.length) fixtures = [ev]
  return { lg, fixtures }
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

  // 3) ligas nacionais que o eventsday (hoje truncado na chave gratuita) não
  //    trouxe: verifica o próximo jogo de cada uma e carrega a rodada se ele
  //    cair na janela de hoje/amanhã.
  const missing = LEAGUES.filter((lg) => !isCupLeague(lg) && !byLeague.has(lg.id))
  const found = await Promise.all(
    missing.map((lg) => discoverLeagueViaNext(lg).catch(() => null)),
  )
  for (const res of found) if (res) byLeague.set(res.lg.id, res)

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
