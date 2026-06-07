import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import StakeSimulator from './StakeSimulator.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'

const BETANO_URL = 'https://www.betano.bet.br/sport'

export default function ReadyTicketCard({ ticket, index }) {
  const { replace } = useBetSlip()

  const openBetanoWithTicket = () => {
    const readyPicks = ticket.games.map((g) => ({
      id: `${g.matchId}:${g.pickLabel}`,
      match: g.match,
      pickLabel: g.pickLabel,
      p: g.p,
      odd: g.odd,
    }))
    replace(readyPicks)
    window.open(BETANO_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
    >
      <div className="card-top">
        <span className={`badge ${ticket.cls}`}>
          {ticket.title} · {ticket.games.length} jogos
        </span>
        <span className="meta">
          Odd <b style={{ color: 'var(--accent)' }}>@{ticket.odd.toFixed(2)}</b>
        </span>
      </div>

      <div className="ticket-games">
        {ticket.games.map((g) => (
          <div className="tg" key={g.matchId}>
            <div className="tg-main">
              <div className="tg-match">
                {g.short} · {g.league} · {g.time}
              </div>
              <div className="tg-pick">{g.pickLabel}</div>
            </div>
            <div className="tg-odd">@{g.odd.toFixed(2)}</div>
          </div>
        ))}
      </div>

      <StakeSimulator odd={ticket.odd} prob={ticket.prob} />
      <button className="ready-betano-btn" onClick={openBetanoWithTicket}>
        <ExternalLink size={15} />
        Fazer bilhete e abrir Betano
      </button>
    </motion.div>
  )
}
