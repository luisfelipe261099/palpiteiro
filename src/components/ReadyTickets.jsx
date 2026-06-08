import { useMemo, useState, useEffect } from 'react'
import ReadyTicketCard from './ReadyTicketCard.jsx'
import { buildDailyTickets } from '../lib/tickets.js'
import { fetchBetanoCodes, todayKey } from '../lib/betanoCodes.js'

export default function ReadyTickets({ groups, loading, error }) {
  const now = new Date()
  const daySeed = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const dateLabel = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  const tickets = useMemo(() => buildDailyTickets(groups, daySeed), [groups, daySeed])

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
      <p className="intro" style={{ textAlign: 'center', padding: '30px 0' }}>
        Sem jogos com previsão confiável para montar bilhetes hoje. Volte quando houver rodadas com histórico.
      </p>
    )
  }

  return (
    <>
      <p className="intro">
        Bilhetes gerados automaticamente para <b>{dateLabel}</b> com os melhores palpites do dia. Digite um valor
        para simular o retorno. Atualizam todos os dias.
      </p>
      {tickets.map((t, i) => (
        <ReadyTicketCard key={t.key} ticket={t} index={i} code={codes[t.key]} />
      ))}
    </>
  )
}
