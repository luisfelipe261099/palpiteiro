// Gera "bilhetes do dia" a partir dos jogos carregados.
// São até 3 bilhetes (Seguro / Médio / Arriscado), montados de um pool com
// VÁRIOS mercados por jogo (resultado/dupla chance, gols +/-2.5 e ambas
// marcam). Isso permite montar bilhetes mesmo em dias com poucos jogos
// (ex.: mata-mata da Copa, com 1–2 partidas por dia): bilhetes diferentes
// podem usar o mesmo jogo em mercados diferentes, como nos bilhetes reais
// das casas de aposta. A seleção é determinística por dia (muda a cada dia,
// estável dentro do mesmo dia).
//
// Se não há jogo hoje/amanhã (dia sem rodada), os bilhetes são montados para
// o PRÓXIMO dia com jogos — a aba nunca fica vazia enquanto houver rodada à
// vista. O dia-alvo volta no resultado para a UI avisar ("bilhetes para
// sexta 07/08").
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

// timestamp da API (UTC) -> Date local (mesma lógica de matches.js/format.js)
function tsToDate(ts) {
  if (!ts) return null
  const iso = ts.replace(' ', 'T')
  const d = new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  return isNaN(d) ? null : d
}
// meia-noite local do dia do jogo (p/ agrupar por dia)
function dayStartMs(ts) {
  const d = tsToDate(ts)
  if (!d) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// monta o pool de palpites: até 4 mercados por jogo previsível.
function allPicks(groups) {
  const out = []
  groups.forEach((g) =>
    g.matches.forEach((m) => {
      // ignora jogos sem previsão confiável / sem dado real / já iniciados
      if (!m.predictable || m.preliminary || m.started) return
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
        // descarta palpites sem valor: muito improváveis (tiro no escuro) ou
        // "certos demais" (odd ~1.0, não agrega nada ao bilhete)
        if (p < 0.33 || p > 0.95) return
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
// "centro" ideal, com um piso (minP) que corta pernas fracas demais para o
// perfil e um piso de confiança (minConf) que exige lastro de dados.
// Seguro = favoritos claros com dados bons (3 pernas ~80% ≈ 51% no combinado);
// Médio = equilíbrio; Arriscado = odds maiores.
const PROFILES = [
  { key: 'safe', title: 'Bilhete Seguro', cls: 'safe', center: 0.8, size: 3, minP: 0.62, minConf: 0.35 },
  { key: 'mid', title: 'Bilhete Médio', cls: 'mid', center: 0.6, size: 4, minP: 0.45, minConf: 0.2 },
  { key: 'risk', title: 'Bilhete Arriscado', cls: 'risk', center: 0.42, size: 3, minP: 0.33, minConf: 0 },
]

// monta um bilhete: escolhe os palpites que melhor "encaixam" no perfil,
// no máximo 1 palpite por jogo dentro do mesmo bilhete. Palpites já usados
// em bilhetes anteriores são penalizados (variedade quando há jogos de
// sobra, reuso permitido quando o dia tem poucos jogos).
function buildTicket(pool, prof, usedPickIds, daySeed) {
  // pisos do perfil; relaxa em degraus se o dia não tem palpites suficientes
  // (melhor um bilhete honesto mais curto/fraco do que aba vazia)
  let candidates = pool.filter((p) => p.p >= prof.minP && p.conf >= prof.minConf)
  if (!candidates.length) candidates = pool.filter((p) => p.p >= prof.minP)
  if (!candidates.length) candidates = pool
  if (!candidates.length) return null

  const rnd = seeded(hashStr(`${daySeed}|${prof.key}`))
  // o Bilhete Seguro exige mais lastro nos dados; nos demais a confiança
  // ainda conta, mas pesa menos (odds maiores toleram mais incerteza)
  const confW = prof.key === 'safe' ? 0.15 : 0.08
  const scored = candidates
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
  const marketCount = {}
  // 1º passe limita gols/btts a 2 pernas por bilhete (diversifica: um bilhete
  // inteiro de "+2.5 gols" concentra risco no mesmo tipo de erro do modelo);
  // 2º passe completa sem o limite se faltou opção.
  for (const capped of [true, false]) {
    for (const { pick } of scored) {
      if (games.length >= prof.size) break
      if (usedMatches.has(pick.matchId)) continue // 1 palpite por jogo no bilhete
      if (capped && (pick.market === 'goals' || pick.market === 'btts') && (marketCount[pick.market] || 0) >= 2)
        continue
      usedMatches.add(pick.matchId)
      marketCount[pick.market] = (marketCount[pick.market] || 0) + 1
      games.push(pick)
    }
  }
  if (!games.length) return null

  games.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''))
  const { odd, prob } = compose(games)
  return { key: prof.key, title: prof.title, cls: prof.cls, games, odd, prob }
}

// Retorna { tickets, dayStart, matchCount }:
// - tickets: até 3 bilhetes (Seguro/Médio/Arriscado)
// - dayStart: meia-noite local (ms) do dia-alvo dos bilhetes, ou null —
//   a UI usa para avisar quando os bilhetes são de um dia futuro
// - matchCount: nº de jogos distintos no pool do dia-alvo
export function buildDailyTickets(groups, daySeed) {
  let pool = allPicks(groups)
  if (!pool.length) return { tickets: [], dayStart: null, matchCount: 0 }

  // dia-alvo: o primeiro dia com jogos palpitáveis (hoje, se houver; senão o
  // próximo dia de rodada). Janela de 2 dias a partir dele, para que jogos de
  // sexta+sábado componham os mesmos bilhetes (como hoje+amanhã compõem).
  const starts = pool.map((p) => dayStartMs(p.ts)).filter((x) => x != null)
  let dayStart = null
  if (starts.length) {
    dayStart = Math.min(...starts)
    const end = dayStart + 2 * 86400000
    const inSpan = pool.filter((p) => {
      const s = dayStartMs(p.ts)
      return s == null || (s >= dayStart && s < end)
    })
    if (inSpan.length) pool = inSpan
  }

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
  return { tickets, dayStart, matchCount }
}
