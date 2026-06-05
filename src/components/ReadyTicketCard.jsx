import { motion } from 'framer-motion'
import StakeSimulator from './StakeSimulator.jsx'

export default function ReadyTicketCard({ ticket, index }) {
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
    </motion.div>
  )
}
