import { useState, useEffect, useMemo } from 'react'
import { fetchLiveEvents, isToday, inLiveWindow, tsToDate } from '../lib/live.js'

const POLL_MS = 75 * 1000 // equilíbrio entre frescor e rate-limit da chave gratuita

// Faz polling do placar dos jogos DE HOJE enquanto a aba Ao Vivo está ativa.
// Retorna { events: mapa matchId -> evento cru da API, at: Date da última
// atualização, ticking: se há jogo na janela ao vivo agora }.
export function useLive(groups, active) {
  const matches = useMemo(
    () => groups.flatMap((g) => g.matches).filter((m) => isToday(m)),
    [groups],
  )

  const [state, setState] = useState({ events: {}, at: null })

  useEffect(() => {
    if (!active || !matches.length) return undefined
    let on = true

    const tick = async () => {
      if (document.hidden) return // não gasta chamadas com a aba em segundo plano
      // consulta jogos já iniciados (para placar/resultado); os futuros só têm
      // horário, não precisam de rede
      const started = matches.filter((m) => {
        const d = tsToDate(m.ts)
        return d && d.getTime() <= Date.now()
      })
      if (!started.length) return
      const evs = await fetchLiveEvents(started)
      if (on && Object.keys(evs).length) {
        setState((s) => ({ events: { ...s.events, ...evs }, at: new Date() }))
      }
    }

    tick()
    const iv = setInterval(tick, POLL_MS)
    const onVis = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      on = false
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [active, matches])

  const ticking = matches.some((m) => inLiveWindow(m))
  return { events: state.events, at: state.at, matches, ticking }
}
