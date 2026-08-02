// Modelo de probabilidade por distribuição de Poisson com correção de
// Dixon-Coles: o Poisson independente subestima empates e placares baixos
// (0-0, 1-1); a correção reponderá esses placares com o fator clássico τ.
import { HOME_ADV } from './leagues.js'

// dependência entre os placares baixos (valor empírico clássico ~ -0.1)
const DC_RHO = -0.11

function factorial(n) {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}
export function poissonPmf(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}
const poisson = poissonPmf

export function predict(match, opts = {}) {
  const rho = opts.rho != null ? opts.rho : DC_RHO
  const avg = match.leagueAvg || 1.35
  const adv = match.homeAdv != null ? match.homeAdv : HOME_ADV
  // limites sanos: amostras pequenas podem gerar taxas extremas de gols
  const clamp = (x) => Math.min(4.5, Math.max(0.2, x))
  const expH = clamp(avg * match.home.att * match.away.def * adv)
  const expA = clamp(avg * match.away.att * match.home.def)

  const tau = (h, a) => {
    if (h === 0 && a === 0) return 1 - expH * expA * rho
    if (h === 1 && a === 0) return 1 + expA * rho
    if (h === 0 && a === 1) return 1 + expH * rho
    if (h === 1 && a === 1) return 1 - rho
    return 1
  }

  let pH = 0,
    pD = 0,
    pA = 0,
    under = 0,
    btts = 0,
    total = 0
  const scores = []
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = poisson(h, expH) * poisson(a, expA) * tau(h, a)
      total += p
      scores.push({ h, a, p })
      if (h > a) pH += p
      else if (h === a) pD += p
      else pA += p
      if (h + a <= 2) under += p
      if (h > 0 && a > 0) btts += p
    }
  }
  // placares mais prováveis da grade corrigida (p/ análise do card — melhor
  // que arredondar gols esperados, que distorce: exp 1.4-1.1 "viraria" 1-1
  // mesmo quando 1-0 é mais provável)
  const topScores = scores
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map((s) => ({ h: s.h, a: s.a, p: s.p / total }))

  // calibração dos mercados de gols, medida no backtest (286 jogos): o modelo
  // superestimava gols (+2.5 previsto 51% × real 47%; btts 55% × 52%).
  // Desloca o viés e encolhe levemente rumo a 50% (mercado menos previsível
  // do que a grade sugere).
  const calib = (p, shift) => Math.min(0.97, Math.max(0.03, 0.5 + (p - 0.5 - shift) * 0.9))
  return {
    pH: pH / total,
    pD: pD / total,
    pA: pA / total,
    btts: calib(btts / total, 0.025),
    over25: calib(1 - under / total, 0.035),
    expH,
    expA,
    topScores,
  }
}

export function bestPick(pr, m, minWin = 0.6) {
  const opts = [
    { key: '1', label: `Vitória ${m.home.name}`, p: pr.pH },
    { key: 'X', label: 'Empate', p: pr.pD },
    { key: '2', label: `Vitória ${m.away.name}`, p: pr.pA },
  ].sort((a, b) => b.p - a.p)

  let pick = opts[0]
  // só recomenda vitória simples com favorito claro (>=60%; no backtest,
  // palpites na faixa 50-60% exibida acertavam só ~38% — abaixo do corte a
  // dupla chance erra bem menos)
  if (pick.p < minWin) {
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

// odd simulada estilo casa de aposta: a casa DESCONTA a margem do preço
// justo (paga menos que 1/p). Antes multiplicava por 1.06 — inflava a odd
// acima do justo e superestimava o retorno no simulador.
export const toOdd = (p) => Math.max(1.01, (1 / p) * 0.94)
export const pct = (p) => Math.round(p * 100)
