import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Ticket, X } from 'lucide-react'
import { useBetSlip } from '../context/BetSlipContext.jsx'
import StakeSimulator from './StakeSimulator.jsx'

export default function BetSlip() {
  const [open, setOpen] = useState(false)
  const { picks, remove, clear, totals } = useBetSlip()

  return (
    <motion.div
      className="slip"
      animate={{ y: open ? 0 : 'calc(100% - 66px)' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
    >
      <div className="slip-handle" onClick={() => setOpen((o) => !o)}>
        <div className="left">
          <Ticket size={20} />
          <span className="tt">Bilhete</span>
          <span className="slip-count">{totals.count}</span>
        </div>
        <div className="slip-summary">
          <div className="k">Odd total</div>
          <div className="v">{totals.count ? `@${totals.odd.toFixed(2)}` : '—'}</div>
        </div>
      </div>

      <div className="slip-body">
        {!picks.length ? (
          <div className="slip-empty">
            Nenhum palpite no bilhete ainda.
            <br />
            Toque em “+ Bilhete” em um jogo.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {picks.map((b) => (
              <motion.div
                key={b.id}
                className="slip-item"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div style={{ flex: 1 }}>
                  <div className="ti-match">{b.match}</div>
                  <div className="ti-pick">{b.pickLabel}</div>
                </div>
                <div className="ti-odd">@{b.odd.toFixed(2)}</div>
                <button className="rm" onClick={() => remove(b.id)}>
                  <X size={18} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {picks.length > 0 ? (
          <>
            <StakeSimulator odd={totals.odd} prob={totals.prob} />
            <button className="clearbtn" onClick={clear}>
              Limpar bilhete
            </button>
          </>
        ) : (
          <div className="slip-foot">
            <div className="box">
              <div className="k">Chance combinada</div>
              <div className="v">—</div>
            </div>
            <div className="box">
              <div className="k">Retorno</div>
              <div className="v">—</div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
