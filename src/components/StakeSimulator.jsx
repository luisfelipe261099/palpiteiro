import { useState } from 'react'

// Simulador de aposta: digita um valor e vê o retorno potencial.
export default function StakeSimulator({ odd, prob }) {
  const [stake, setStake] = useState('10')
  const value = Number(stake) || 0
  const ret = value * odd

  return (
    <div className="stake">
      <div className="stake-label">Simular aposta</div>
      <div className="stake-row">
        <div className="stake-input">
          <span>R$</span>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="10"
          />
        </div>
        <div className="stake-box">
          <span className="k">Chance</span>
          <span className="v">{Math.round(prob * 100)}%</span>
        </div>
        <div className="stake-box accent">
          <span className="k">Retorno</span>
          <span className="v">R${ret.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
