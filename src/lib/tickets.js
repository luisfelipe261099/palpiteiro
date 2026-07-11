// Gera "bilhetes do dia" a partir dos jogos carregados.
// São até 3 bilhetes (Seguro / Médio / Arriscado), montados de um pool com
// VÁRIOS mercados por jogo (resultado/dupla chance, gols +/-2.5 e ambas
// marcam). Isso permite montar bilhetes mesmo em dias com poucos jogos
// (ex.: mata-mata da Copa, com 1–2 partidas por dia): bilhetes diferentes
// podem usar o mesmo jogo em mercados diferentes, como nos bilhetes reais
// das casas de aposta. A seleção é determinística por dia (muda a cada dia,
// estável dentro do mesmo dia).
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

// monta o pool de palpites: até 3 mercados por jogo previsível.
function allPicks(groups) {
  const out = []
  groups.forEach((g) =>
    g.matches.forEach((m) => {
      if (!m.predictable || m.preliminary) return // ignora jogos sem previsão confiável / sem dado real
      const pr = predict(m)
      const base = {
        matchId: m.id,
        short: `${m.home.short} x ${m.away.short}`,
        match: `${m.home.name} x ${m.away.name}`,
        league: m.league,
        time: m.time,
        ts: m.ts,
        conf: m.conf != null ? m.conf : 0.5,
      }
      const add = (market, label, p) => {
        // descarta palpites sem valor (muito improváveis ou "certos demais",
        // que viram odd ~1.0 e não agregam nada ao bilhete)
        if (p < 0.3 || p > 0.92) return
        out.push({
          ...base,
          id: `${m.id}:${market}`,
          market,
          pickLabel: label,
          p,
          odd: toOdd(p),
          cls: tier(p).cls,
        })
      }

      // 1) resultado (1X2 ou dupla chance, o que for mais confiável)
      const pick = bestPick(pr, m)
      add('result', pick.label, pick.p)

      // 1b) dupla chance do favorito (perna segura p/ o Bilhete Seguro),
      // quando o resultado sugerido foi vitória simples
      if (pick.key === '1' || pick.key === '2') {
        if (pick.key === '1') add('dc', `${m.home.short} ou Empate`, pr.pH + pr.pD)
        else add('dc', `Empate ou ${m.away.short}`, pr.pD + pr.pA)
      }

      // 2) total de gols: o lado mais provável de +/-2.5
      if (pr.over25 >= 0.5) add('goals', 'Mais de 2.5 gols', pr.over25)
      else add('goals', 'Menos de 2.5 gols', 1 - pr.over25)

      // 3) ambas marcam: o lado mais provável
      if (pr.btts >= 0.5) add('btts', 'Ambas marcam: Sim', pr.btts)
      else add('btts', 'Ambas marcam: Não', 1 - pr.btts)
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

// perfis: cada bilhete busca palpites cuja probabilidade fique perto do seu
// "centro" ideal. Seguro = favoritos claros; Médio = equilíbrio; Arriscado =
// odds maiores.
const PROFILES = [
  { key: 'safe', title: 'Bilhete Seguro', cls: 'safe', center: 0.74, size: 3 },
  { key: 'mid', title: 'Bilhete Médio', cls: 'mid', center: 0.56, size: 4 },
  { key: 'risk', title: 'Bilhete Arriscado', cls: 'risk', center: 0.4, size: 3 },
]

// monta um bilhete: escolhe os palpites que melhor "encaixam" no perfil,
// no máximo 1 palpite por jogo dentro do mesmo bilhete. Palpites já usados
// em bilhetes anteriores são penalizados (variedade quando há jogos de
// sobra, reuso permitido quando o dia tem poucos jogos).
function buildTicket(pool, prof, usedPickIds, daySeed) {
  if (!pool.length) return null
  const rnd = seeded(hashStr(`${daySeed}|${prof.key}`))
  // o Bilhete Seguro exige mais lastro nos dados; nos demais a confiança
  // ainda conta, mas pesa menos (odds maiores toleram mais incerteza)
  const confW = prof.key === 'safe' ? 0.15 : 0.08
  const scored = pool
    .map((p) => ({
      pick: p,
      score:
        -Math.abs(p.p - prof.center) + // distância do perfil
        p.conf * confW - // jogos com mais dados na frente
        (usedPickIds.has(p.id) ? 0.18 : 0) + // já saiu em outro bilhete
        rnd() * 0.05, // desempate/variação diária
    }))
    .sort((a, b) => b.score - a.score)

  const games = []
  const usedMatches = new Set()
  for (const { pick } of scored) {
    if (games.length >= prof.size) break
    if (usedMatches.has(pick.matchId)) continue // 1 palpite por jogo no bilhete
    usedMatches.add(pick.matchId)
    games.push(pick)
  }
  if (!games.length) return null

  games.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''))
  const { odd, prob } = compose(games)
  return { key: prof.key, title: prof.title, cls: prof.cls, games, odd, prob }
}

export function buildDailyTickets(groups, daySeed) {
  const pool = allPicks(groups)
  if (!pool.length) return []

  const matchCount = new Set(pool.map((p) => p.matchId)).size
  const usedPickIds = new Set()
  const seen = new Set() // dedup de bilhetes idênticos (dias com 1 jogo só)
  const tickets = []

  for (const prof of PROFILES) {
    // adapta o tamanho ao dia: nunca pede mais jogos do que existem
    const size = Math.max(1, Math.min(prof.size, matchCount))
    const t = buildTicket(pool, { ...prof, size }, usedPickIds, daySeed)
    if (!t) continue
    const sig = t.games
      .map((g) => g.id)
      .sort()
      .join('|')
    if (seen.has(sig)) continue
    seen.add(sig)
    t.games.forEach((g) => usedPickIds.add(g.id))
    tickets.push(t)
  }

  // exibe sempre na ordem Seguro · Médio · Arriscado
  const order = { safe: 0, mid: 1, risk: 2 }
  tickets.sort((a, b) => order[a.key] - order[b.key])
  return tickets
}
