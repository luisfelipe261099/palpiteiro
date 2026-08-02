import { useMemo, useState, useEffect } from 'react'
import { CalendarX2, CalendarClock } from 'lucide-react'
import ReadyTicketCard from './ReadyTicketCard.jsx'
import { buildDailyTickets } from '../lib/tickets.js'
import { fetchBetanoCodes, todayKey } from '../lib/betanoCodes.js'

// rótulo amigável do dia-alvo dos bilhetes (hoje / amanhã / sex 07/08)
function dayLabel(dayStart) {
  if (dayStart == null) return null
  const d = new Date(dayStart)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((dayStart - today) / 86400000)
  if (diff <= 0) return null // bilhetes de hoje: sem aviso
  if (diff === 1) return 'amanhã'
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function ReadyTickets({ groups, loading, error, onGoMatches }) {
  const now = new Date()
  const daySeed = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const dateLabel = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  const { tickets, dayStart, matchCount } = useMemo(
    () => buildDailyTickets(groups, daySeed),
    [groups, daySeed],
  )
  const futureLabel = dayLabel(dayStart)

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
          Nenhum jogo dos próximos dias tem dados suficientes (histórico ou ranking) para gerar palpites
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
      {futureLabel ? (
        <p className="intro">
          Hoje não tem rodada nas competições acompanhadas, então os bilhetes já foram montados para{' '}
          <b>{futureLabel}</b>, o próximo dia com jogos. Digite um valor para simular o retorno.
        </p>
      ) : (
        <p className="intro">
          Bilhetes gerados automaticamente para <b>{dateLabel}</b> com os melhores palpites do dia. Digite um
          valor para simular o retorno. Atualizam todos os dias.
        </p>
      )}
      {futureLabel && (
        <p className="ticket-note">
          <CalendarClock size={14} style={{ verticalAlign: '-2px' }} /> Os palpites são recalculados todo dia —
          vale conferir de novo mais perto dos jogos.
        </p>
      )}
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
