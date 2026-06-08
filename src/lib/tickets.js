// Gera "bilhetes do dia" a partir dos jogos carregados.
// São 3 bilhetes (Seguro / Médio / Arriscado). A seleção é determinística
// por dia (muda a cada dia, estável dentro do mesmo dia).
import { predict, bestPick, tier, toOdd } from './poisson.js'

// hash + PRNG determinísticos (sem Math.random, p/ ser estável por dia)
function hashStr(s) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function seeded(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle(arr, rnd) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function allPicks(groups) {
  const out = []
  groups.forEach((g) =>
    g.matches.forEach((m) => {
      if (!m.predictable || m.preliminary) return // ignora jogos sem previsão confiável / sem dado real
      const pr = predict(m)
      const pick = bestPick(pr, m)
      out.push({
        matchId: m.id,
        short: `${m.home.short} x ${m.away.short}`,
        match: `${m.home.name} x ${m.away.name}`,
        league: m.league,
        time: m.time,
        pickLabel: pick.label,
        p: pick.p,
        odd: toOdd(pick.p),
        cls: tier(pick.p).cls,
      })
    }),
  )
  return out
}

function compose(games) {
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

function pick(avail, def, end, daySeed) {
  if (avail.length < 2) return null
  const size = Math.min(def.size, avail.length)
  // janela = bilhete + 1, na ponta certa (variação leve por dia, sem vazar
  // jogos prováveis para o bilhete arriscado e vice-versa)
  const win = avail.length <= size ? avail : end === 'low' ? avail.slice(-(size + 1)) : avail.slice(0, size + 1)
  const rnd = seeded(hashStr(`${daySeed}|${def.key}`))
  const chosen = shuffle(win, rnd).slice(0, size)
  const { odd, prob } = compose(chosen)
  return { key: def.key, title: def.title, cls: def.cls, games: chosen, odd, prob }
}

export function buildDailyTickets(groups, daySeed) {
  const picks = allPicks(groups)
  if (picks.length < 3) return []

  const sorted = [...picks].sort((a, b) => b.p - a.p) // maior probabilidade primeiro
  const used = new Set()
  const avail = () => sorted.filter((p) => !used.has(p.matchId))
  const take = (t) => t && t.games.forEach((g) => used.add(g.matchId))

  // ordem de montagem: Seguro (topo) → Arriscado (fundo) → Médio (sobra do meio)
  const safe = pick(avail(), DEFS.safe, 'high', daySeed)
  take(safe)
  const risk = pick(avail(), DEFS.risk, 'low', daySeed)
  take(risk)
  const mid = pick(avail(), DEFS.mid, 'high', daySeed)
  take(mid)

  // exibe na ordem Seguro · Médio · Arriscado
  return [safe, mid, risk].filter(Boolean)
}
