import { useMemo, useState, useEffect } from 'react'
import ReadyTicketCard from './ReadyTicketCard.jsx'
import CustomTickets from './CustomTickets.jsx'
import { buildDailyTickets } from '../lib/tickets.js'
import { fetchBetanoCodes, todayKey } from '../lib/betanoCodes.js'

export default function ReadyTickets({ groups, loading, error }) {
  const now = new Date()
  const dateLabel = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  const tickets = useMemo(() => buildDailyTickets(groups), [groups])

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
  return (
    <>
      <p className="intro">
        Bilhetes gerados automaticamente para <b>hoje, {dateLabel}</b> — só com <b>jogos de hoje</b> e os melhores
        palpites do dia. Digite um valor para simular o retorno. Atualizam todos os dias.
      </p>

      {tickets.length ? (
        tickets.map((t, i) => <ReadyTicketCard key={t.key} ticket={t} index={i} code={codes[t.key]} />)
      ) : (
        <p className="intro" style={{ textAlign: 'center', padding: '20px 0' }}>
          Sem jogos de hoje com previsão confiável para os bilhetes automáticos. Você ainda pode montar o seu abaixo.
        </p>
      )}

      <CustomTickets groups={groups} />
    </>
  )
}
