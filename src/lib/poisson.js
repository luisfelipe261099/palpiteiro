// Modelo de probabilidade por distribuição de Poisson, agora com:
//  • força ofensiva/defensiva separada por mando (casa x fora);
//  • ajuste de forma recente (times embalados ganham gols esperados);
//  • correção de Dixon-Coles para placares baixos (melhora empates/0-0/1-1).
// A força e as médias de gols vêm dos RESULTADOS reais das últimas rodadas
// (ver src/lib/matches.js).
import { HOME_ADV } from './leagues.js'

const MAXG = 8 // teto de gols no grid de placares
const DC_RHO = -0.06 // correção Dixon-Coles (dependência nos placares baixos)
const FORM_W = 0.18 // peso da forma recente sobre os gols esperados

function factorial(n) {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}
function poisson(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}

// Correção de Dixon-Coles: o Poisson duplo independente subestima 0-0 e 1-1 e
// superestima 1-0/0-1. tau reequilibra esses quatro placares baixos (rho < 0).
function dcTau(h, a, lambda, mu, rho) {
  if (h === 0 && a === 0) return 1 - lambda * mu * rho
  if (h === 0 && a === 1) return 1 + lambda * rho
  if (h === 1 && a === 0) return 1 + mu * rho
  if (h === 1 && a === 1) return 1 - rho
  return 1
}

// pontuação de forma: média de pontos dos últimos jogos (W=1, D=0.5, L=0).
// 0.5 = neutro. Vira um multiplicador leve nos gols esperados.
function formScore(form) {
  if (!form || !form.length) return 0.5
  let s = 0
  for (const r of form) s += r === 'W' ? 1 : r === 'D' ? 0.5 : 0
  return s / form.length
}
function formMult(form, w) {
  return 1 + w * (formScore(form) - 0.5)
}

// lê o atributo de mando com fallback para o valor geral (compatível com dados
// antigos / seleções que só têm att/def gerais).
function attr(team, mandoKey, geralKey) {
  if (team[mandoKey] != null) return team[mandoKey]
  if (team[geralKey] != null) return team[geralKey]
  return 1
}

export function predict(match, opts = {}) {
  const rho = opts.rho != null ? opts.rho : DC_RHO
  const formW = opts.formW != null ? opts.formW : FORM_W
  const avg = match.leagueAvg || 1.35
  // médias de gols de mandante e visitante (vantagem de mando vinda dos dados
  // da liga; cai no fator fixo quando a liga ainda não tem split calculado).
  const muH = match.muHome || avg * (match.homeAdv != null ? match.homeAdv : HOME_ADV)
  const muA = match.muAway || avg

  const h = match.home
  const a = match.away
  // mandante ataca com sua força de CASA contra a defesa de FORA do visitante;
  // visitante ataca com sua força de FORA contra a defesa de CASA do mandante.
  let expH = muH * attr(h, 'attH', 'att') * attr(a, 'defA', 'def') * formMult(h.form, formW)
  let expA = muA * attr(a, 'attA', 'att') * attr(h, 'defH', 'def') * formMult(a.form, formW)
  // limites sãos p/ dados ruidosos não explodirem o grid
  expH = Math.min(5, Math.max(0.2, expH))
  expA = Math.min(5, Math.max(0.2, expA))

  let pH = 0,
    pD = 0,
    pA = 0,
    over = 0,
    btts = 0,
    T = 0
  let bestP = -1,
    sH = 0,
    sA = 0
  for (let i = 0; i <= MAXG; i++) {
    const pi = poisson(i, expH)
    for (let j = 0; j <= MAXG; j++) {
      const p = pi * poisson(j, expA) * dcTau(i, j, expH, expA, rho)
      T += p
      if (i > j) pH += p
      else if (i === j) pD += p
      else pA += p
      if (i + j >= 3) over += p
      if (i >= 1 && j >= 1) btts += p
      if (p > bestP) {
        bestP = p
        sH = i
        sA = j
      }
    }
  }
  return {
    pH: pH / T,
    pD: pD / T,
    pA: pA / T,
    btts: btts / T,
    over25: over / T,
    expH,
    expA,
    scoreH: sH,
    scoreA: sA,
  }
}

// Todos os mercados que o modelo cobre, com label e probabilidade. Usado tanto
// pelo palpite automático (bestPick) quanto pelo construtor de bilhetes manual.
export function marketOptions(pr, m) {
  return [
    { key: '1', label: `Vitória ${m.home.name}`, p: pr.pH, group: 'Resultado' },
    { key: 'X', label: 'Empate', p: pr.pD, group: 'Resultado' },
    { key: '2', label: `Vitória ${m.away.name}`, p: pr.pA, group: 'Resultado' },
    { key: '1X', label: `${m.home.short} ou Empate`, p: pr.pH + pr.pD, group: 'Dupla chance' },
    { key: '12', label: 'Sem empate (1 ou 2)', p: pr.pH + pr.pA, group: 'Dupla chance' },
    { key: 'X2', label: `Empate ou ${m.away.short}`, p: pr.pD + pr.pA, group: 'Dupla chance' },
    { key: 'O25', label: 'Mais de 2.5 gols', p: pr.over25, group: 'Gols' },
    { key: 'U25', label: 'Menos de 2.5 gols', p: 1 - pr.over25, group: 'Gols' },
    { key: 'BTS', label: 'Ambas marcam: Sim', p: pr.btts, group: 'Gols' },
    { key: 'BTN', label: 'Ambas marcam: Não', p: 1 - pr.btts, group: 'Gols' },
  ]
}

// Escolhe o palpite mais "de valor" considerando vários mercados, não só 1X2:
// favorito claro → resultado seco; senão tendência de gols/ambas; senão dupla
// chance como rede de segurança. Mantém o palpite confiável sem ser trivial.
export function bestPick(pr, m) {
  const o = marketOptions(pr, m)
  const by = (k) => o.find((x) => x.key === k)
  const oneX2 = [by('1'), by('X'), by('2')].sort((a, b) => b.p - a.p)
  const goals = [by('O25'), by('U25'), by('BTS'), by('BTN')].sort((a, b) => b.p - a.p)
  const dbl = [by('1X'), by('12'), by('X2')].sort((a, b) => b.p - a.p)

  if (oneX2[0].p >= 0.55) return oneX2[0] // favorito claro → resultado seco
  if (goals[0].p >= 0.62) return goals[0] // tendência forte de gols / ambas
  return dbl[0] // jogo aberto → dupla chance mais provável
}

export function tier(p) {
  if (p >= 0.6) return { cls: 'safe', txt: 'Seguro' }
  if (p >= 0.45) return { cls: 'mid', txt: 'Médio' }
  return { cls: 'risk', txt: 'Arriscado' }
}

export const toOdd = (p) => (1 / p) * 1.06 // +6% margem simulada
export const pct = (p) => Math.round(p * 100)

// ── Value betting ──────────────────────────────────────────────────────────
// A odd da casa embute uma probabilidade implícita (1/odd). Há "valor" quando a
// nossa probabilidade do modelo é maior que a implícita — ou seja, o retorno
// esperado por real apostado (p*odd) supera 1. É onde mora o lucro de longo prazo.

// probabilidade implícita na odd ofertada (sem remover a margem da casa).
export const impliedProb = (odd) => (odd > 0 ? 1 / odd : 0)

// retorno esperado por unidade apostada: > 0 = valor, < 0 = aposta cara.
export const valueEdge = (p, odd) => p * odd - 1

// classifica o edge p/ a UI. Limiar de 5% evita marcar como "valor" diferenças
// dentro do ruído do modelo.
export function valueTier(edge) {
  if (edge >= 0.05) return { cls: 'safe', txt: 'Valor' }
  if (edge >= -0.02) return { cls: 'mid', txt: 'Justa' }
  return { cls: 'risk', txt: 'Sem valor' }
}
