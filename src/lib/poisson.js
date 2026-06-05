// Modelo de probabilidade por distribuição de Poisson.
import { HOME_ADV } from './leagues.js'

function factorial(n) {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}
function poisson(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}

export function predict(match) {
  const avg = match.leagueAvg || 1.35
  const expH = avg * match.home.att * match.away.def * HOME_ADV
  const expA = avg * match.away.att * match.home.def

  let pH = 0,
    pD = 0,
    pA = 0,
    under = 0
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = poisson(h, expH) * poisson(a, expA)
      if (h > a) pH += p
      else if (h === a) pD += p
      else pA += p
      if (h + a <= 2) under += p
    }
  }
  const btts = (1 - Math.exp(-expH)) * (1 - Math.exp(-expA))
  const over25 = 1 - under
  const s = pH + pD + pA
  return { pH: pH / s, pD: pD / s, pA: pA / s, btts, over25, expH, expA }
}

export function bestPick(pr, m) {
  const opts = [
    { key: '1', label: `Vitória ${m.home.name}`, p: pr.pH },
    { key: 'X', label: 'Empate', p: pr.pD },
    { key: '2', label: `Vitória ${m.away.name}`, p: pr.pA },
  ].sort((a, b) => b.p - a.p)

  let pick = opts[0]
  if (pick.p < 0.45) {
    // sem favorito claro: sugere dupla chance mais provável
    pick = [
      { key: '1X', label: `${m.home.short} ou Empate`, p: pr.pH + pr.pD },
      { key: '12', label: 'Sem empate', p: pr.pH + pr.pA },
      { key: 'X2', label: `Empate ou ${m.away.short}`, p: pr.pD + pr.pA },
    ].sort((a, b) => b.p - a.p)[0]
  }
  return pick
}

export function tier(p) {
  if (p >= 0.6) return { cls: 'safe', txt: 'Seguro' }
  if (p >= 0.45) return { cls: 'mid', txt: 'Médio' }
  return { cls: 'risk', txt: 'Arriscado' }
}

export const toOdd = (p) => (1 / p) * 1.06 // +6% margem simulada
export const pct = (p) => Math.round(p * 100)
