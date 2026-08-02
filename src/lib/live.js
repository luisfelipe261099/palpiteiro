// Acompanhamento ao vivo. O livescore "de verdade" da TheSportsDB é premium;
// na chave gratuita, o registro do evento (lookupevent.php) atualiza placar e
// status (1H/HT/2H/FT) DURANTE o jogo, com atraso de alguns minutos. Bom o
// bastante para acompanhar e recalcular as probabilidades em tempo quase real.
//
// O minuto do jogo não vem na API: é estimado pelo relógio a partir do
// horário de início (com pausa de ~15min para o intervalo).
import { predict, poissonPmf } from './poisson.js'
import { fetchJson } from './api.js'

// mesmo parser de timestamp usado em matches.js (UTC -> Date local)
export function tsToDate(ts) {
  if (!ts) return null
  const iso = ts.replace(' ', 'T')
  const d = new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  return isNaN(d) ? null : d
}

export function isToday(match, now = new Date()) {
  const d = tsToDate(match.ts)
  return !!d && d.toDateString() === now.toDateString()
}

// vale a pena consultar o placar? (de 5 min antes do início até ~3h depois)
export function inLiveWindow(match, now = new Date()) {
  const d = tsToDate(match.ts)
  if (!d) return false
  const t = now.getTime()
  return t >= d.getTime() - 5 * 60000 && t <= d.getTime() + 190 * 60000
}

// consulta os eventos (sem o cache de 5min do api.js — placar precisa ser
// fresco; via proxy, o cache da CDN é de só ~45s para lookupevent)
export async function fetchLiveEvents(matches) {
  const out = {}
  await Promise.all(
    matches.map(async (m) => {
      const evId = m.eventId || String(m.id).split('-')[1]
      if (!evId) return
      try {
        const j = await fetchJson(`lookupevent.php?id=${evId}`)
        const e = j && j.events && j.events[0]
        if (e) out[m.id] = e
      } catch {
        /* rede falhou: mantém último estado conhecido */
      }
    }),
  )
  return out
}

const FINISHED = new Set(['FT', 'AET', 'PEN', 'MATCH FINISHED', 'FINISHED', 'ENDED'])
const OFF = new Set(['PST', 'POSTPONED', 'CANC', 'CANCELLED', 'ABD', 'ABANDONED', 'SUSP', 'SUSPENDED'])

// interpreta o evento da API + relógio e devolve o estado do jogo:
//   { phase: 'pre' | 'live' | 'ht' | 'ft' | 'off', hs, as, minute, frac, label }
export function liveState(match, e, now = new Date()) {
  const kick = tsToDate(match.ts)
  const raw = (((e && e.strStatus) || '') + '').toUpperCase().trim()
  const has = (v) => v != null && v !== ''
  const hs = e && has(e.intHomeScore) ? +e.intHomeScore : null
  const as = e && has(e.intAwayScore) ? +e.intAwayScore : null

  if (OFF.has(raw)) return { phase: 'off', label: 'Adiado/suspenso' }
  if (FINISHED.has(raw)) {
    return { phase: 'ft', hs: hs ?? 0, as: as ?? 0, label: raw === 'FT' ? 'Encerrado' : `Encerrado · ${raw}` }
  }

  const mins = kick ? (now.getTime() - kick.getTime()) / 60000 : -1
  if (mins < 0) return { phase: 'pre', label: null }

  // já deu tempo de sobra e o status não virou FT: considera encerrado com o
  // último placar conhecido (a chave gratuita às vezes demora a fechar o jogo)
  if (mins > 160) {
    return { phase: 'ft', hs: hs ?? 0, as: as ?? 0, label: 'Encerrado' }
  }

  // minuto estimado pelo relógio (a API gratuita não fornece o cronômetro)
  let minute
  let phase = 'live'
  let label
  if (raw === 'HT' || (mins > 47 && mins < 62)) {
    minute = 45
    phase = 'ht'
    label = 'Intervalo'
  } else if (mins <= 47) {
    minute = Math.max(1, Math.round(mins))
    label = `${minute}′`
  } else {
    minute = Math.min(90, Math.round(mins - 15))
    label = minute >= 90 ? '90′+' : `${minute}′`
  }
  return {
    phase,
    hs: hs ?? 0,
    as: as ?? 0,
    minute,
    frac: Math.min(0.97, minute / 90),
    label,
    scoreKnown: hs != null,
  }
}

// probabilidades AO VIVO: condiciona o modelo pré-jogo ao placar atual e ao
// tempo restante — os gols esperados restantes são proporcionais ao tempo
// que falta, e o placar corrente entra como base do resultado final.
export function livePredict(match, hs, as, frac) {
  const pre = predict(match)
  const remH = Math.max(0.04, pre.expH * (1 - frac))
  const remA = Math.max(0.04, pre.expA * (1 - frac))
  let pH = 0,
    pD = 0,
    pA = 0,
    over = 0,
    btts = 0,
    total = 0
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const p = poissonPmf(h, remH) * poissonPmf(a, remA)
      total += p
      const fh = hs + h
      const fa = as + a
      if (fh > fa) pH += p
      else if (fh === fa) pD += p
      else pA += p
      if (fh + fa >= 3) over += p
      if (fh > 0 && fa > 0) btts += p
    }
  }
  return {
    pH: pH / total,
    pD: pD / total,
    pA: pA / total,
    over25: over / total,
    btts: btts / total,
    expH: pre.expH,
    expA: pre.expA,
  }
}

// o palpite (1/X/2/dupla chance) bate com um placar? true/false; null = mercado
// que não dá para avaliar só pelo placar final
export function pickHits(pickKey, hs, as) {
  const res = hs > as ? '1' : hs === as ? 'X' : '2'
  if (pickKey === '1' || pickKey === 'X' || pickKey === '2') return pickKey === res
  if (pickKey === '1X') return res !== '2'
  if (pickKey === '12') return res !== 'X'
  if (pickKey === 'X2') return res !== '1'
  return null
}
