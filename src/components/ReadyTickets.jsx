import { useMemo, useState, useEffect } from 'react'
import { CalendarX2 } from 'lucide-react'
import ReadyTicketCard from './ReadyTicketCard.jsx'
import { buildDailyTickets } from '../lib/tickets.js'
import { fetchBetanoCodes, todayKey } from '../lib/betanoCodes.js'

export default function ReadyTickets({ groups, loading, error, onGoMatches }) {
  const now = new Date()
  const daySeed = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const dateLabel = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  const tickets = useMemo(() => buildDailyTickets(groups, daySeed), [groups, daySeed])
  const matchCount = useMemo(() => {
    const ids = new Set()
    tickets.forEach((t) => t.games.forEach((g) => ids.add(g.matchId)))
    return ids.size
  }, [tickets])

  // códigos de aposta da Betano do dia (preenchidos pelo admin), por tipo de
  // bilhete. Ausentes -> os cards caem no fluxo antigo de "montar na Betano".
  const [codes, setCodes] = useState({})
  useEffect(() => {
    let on = true
    fetchBetanoCodes(todayKey()).then((c) => on && setCodes(c))
    return () => {
      on = false
    }
  }, [])

  if (loading) {
    return (
      <>
        <div className="state">
          <span className="spin" />
          Gerando os bilhetes do dia…
        </div>
        <div className="skel" />
      </>
    )
  }
  if (error) {
    return <div className="state">{error}</div>
  }
  if (!tickets.length) {
    return (
      <div className="empty-tickets">
        <CalendarX2 size={34} strokeWidth={1.5} />
        <div className="empty-title">Sem bilhetes por enquanto</div>
        <p>
          Nenhum jogo de hoje ou amanhã tem dados suficientes (histórico ou ranking) para gerar palpites
          confiáveis. Os bilhetes voltam automaticamente na próxima rodada com jogos previsíveis.
        </p>
        {onGoMatches && (
          <button className="retry" onClick={onGoMatches}>
            Ver os jogos disponíveis
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <p className="intro">
        Bilhetes gerados automaticamente para <b>{dateLabel}</b> com os melhores palpites do dia. Digite um valor
        para simular o retorno. Atualizam todos os dias.
      </p>
      {matchCount <= 2 && (
        <p className="ticket-note">
          Dia com poucos jogos previsíveis: os bilhetes ficam mais curtos e combinam mercados diferentes
          (resultado, gols e ambas marcam) dos mesmos jogos.
        </p>
      )}
      {tickets.map((t, i) => (
        <ReadyTicketCard key={t.key} ticket={t} index={i} code={codes[t.key]} />
      ))}
    </>
  )
}
