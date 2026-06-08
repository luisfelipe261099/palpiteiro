import { useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, Copy, Check } from 'lucide-react'
import StakeSimulator from './StakeSimulator.jsx'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import { openBetano, openBetanoWithCode } from '../lib/betano.js'

export default function ReadyTicketCard({ ticket, index, code }) {
  const { replace } = useBetSlip()
  const [copied, setCopied] = useState(false)

  // fallback (sem código do dia): carrega o bilhete no app e abre a Betano,
  // onde o usuário monta os jogos manualmente.
  const openWithTicket = () => {
    const readyPicks = ticket.games.map((g) => ({
      id: `${g.matchId}:${g.pickLabel}`,
      match: g.match,
      pickLabel: g.pickLabel,
      p: g.p,
      odd: g.odd,
    }))
    replace(readyPicks)
    openBetano()
  }

  // com código: copia o booking code e abre a Betano (1 colar carrega tudo).
  const openWithCode = async () => {
    const ok = await openBetanoWithCode(code)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
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

      {code ? (
        <div className="ticket-code">
          <div className="ticket-code-row">
            <span className="ticket-code-label">Código Betano</span>
            <span className="ticket-code-val">{code}</span>
          </div>
          <button className="ready-betano-btn" onClick={openWithCode}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Código copiado · abrindo Betano' : 'Copiar código e abrir Betano'}
          </button>
          <div className="ticket-code-hint">
            Na Betano, cole em <b>“Insert Booking Code”</b> para carregar o bilhete inteiro de uma vez.
          </div>
        </div>
      ) : (
        <button className="ready-betano-btn" onClick={openWithTicket}>
          <ExternalLink size={15} />
          Fazer bilhete e abrir Betano
        </button>
      )}
    </motion.div>
  )
}
