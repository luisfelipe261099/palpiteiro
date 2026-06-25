// Gera "bilhetes do dia" a partir dos jogos carregados.
// São até 3 bilhetes (Seguro / Médio / Arriscado), montados APENAS com jogos de
// HOJE e por qualidade (probabilidade do modelo), de forma determinística — sem
// sorteio, sempre os melhores palpites disponíveis no dia.
import { predict, bestPick, tier, toOdd } from './poisson.js'

// converte o timestamp (UTC) da API em Date local (mesma lógica de matches.js).
function tsToDate(ts) {
  if (!ts) return null
  const iso = ts.replace(' ', 'T')
  const d = new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  return isNaN(d) ? null : d
}

// um jogo é "de hoje" quando cai na data local de hoje.
export function isToday(ts) {
  const d = tsToDate(ts)
  if (!d) return false
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

// jogos previsíveis de HOJE (achatados), base dos bilhetes e do construtor manual.
export function todayPredictableMatches(groups) {
  const out = []
  groups.forEach((g) =>
    g.matches.forEach((m) => {
      if (!m.predictable || m.preliminary) return // sem previsão confiável
      if (!isToday(m.ts)) return // só jogos de hoje
      out.push(m)
    }),
  )
  return out
}

// transforma um jogo num "pick" pronto p/ bilhete, usando o palpite sugerido.
function toPick(m) {
  const pr = predict(m)
  const pick = bestPick(pr, m)
  return {
    matchId: m.id,
    short: `${m.home.short} x ${m.away.short}`,
    match: `${m.home.name} x ${m.away.name}`,
    league: m.league,
    time: m.time,
    pickLabel: pick.label,
    p: pick.p,
    odd: toOdd(pick.p),
    cls: tier(pick.p).cls,
  }
}

export function compose(games) {
  let odd = 1
  let prob = 1
  games.forEach((g) => {
    odd *= g.odd
    prob *= g.p
  })
  return { odd, prob }
}

const DEFS = {
  safe: { key: 'safe', title: 'Bilhete Seguro', cls: 'safe', size: 3 },
  mid: { key: 'mid', title: 'Bilhete Médio', cls: 'mid', size: 4 },
  risk: { key: 'risk', title: 'Bilhete Arriscado', cls: 'risk', size: 3 },
}

function makeTicket(def, games) {
  if (games.length < 2) return null // bilhete precisa de pelo menos 2 jogos
  const { odd, prob } = compose(games)
  return { key: def.key, title: def.title, cls: def.cls, games, odd, prob }
}

export function buildDailyTickets(groups) {
  const picks = todayPredictableMatches(groups).map(toPick)
  if (picks.length < 2) return []

  // ordenado por probabilidade (maior = mais provável de bater).
  const sorted = [...picks].sort((a, b) => b.p - a.p)
  const used = new Set()
  const avail = () => sorted.filter((p) => !used.has(p.matchId))
  const mark = (games) => games.forEach((g) => used.add(g.matchId))

  // Seguro: as maiores probabilidades do dia.
  const safe = avail().slice(0, DEFS.safe.size)
  mark(safe)
  // Arriscado: as maiores odds restantes (palpites menos óbvios, payout maior).
  const risk = [...avail()].sort((a, b) => b.odd - a.odd).slice(0, DEFS.risk.size)
  mark(risk)
  // Médio: os melhores remanescentes.
  const mid = avail().slice(0, DEFS.mid.size)
  mark(mid)

  // exibe na ordem Seguro · Médio · Arriscado
  return [makeTicket(DEFS.safe, safe), makeTicket(DEFS.mid, mid), makeTicket(DEFS.risk, risk)].filter(Boolean)
}
