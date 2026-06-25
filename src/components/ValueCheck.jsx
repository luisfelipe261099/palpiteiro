import { useState } from 'react'
import { impliedProb, valueEdge, valueTier, pct } from '../lib/poisson.js'

// Verificador de valor: o usuário digita a odd da casa (Betano) para o palpite
// sugerido e o app diz se há VALOR — probabilidade do modelo vs. a implícita na
// odd. Edge = p*odd - 1 (retorno esperado por real). Vazio por padrão (sem ruído
// visual); só aparece o resultado quando uma odd válida é digitada.
export default function ValueCheck({ p }) {
  const [raw, setRaw] = useState('')
  const odd = parseFloat(raw.replace(',', '.'))
  const valid = !isNaN(odd) && odd > 1

  const edge = valid ? valueEdge(p, odd) : 0
  const t = valid ? valueTier(edge) : null
  const sign = edge >= 0 ? '+' : ''

  return (
    <div className="value">
      <div className="value-row">
        <label className="value-lbl">Tem valor? Digite a odd da casa</label>
        <input
          className="value-input"
          type="text"
          inputMode="decimal"
          placeholder="ex.: 1.85"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </div>
      {valid ? (
        <div className="value-out">
          <span className={`badge ${t.cls}`}>
            {t.txt} · {sign}
            {Math.round(edge * 100)}%
          </span>
          <span className="value-note">
            modelo {pct(p)}% · odd justa @{(1 / p).toFixed(2)} · implícita {pct(impliedProb(odd))}%
          </span>
        </div>
      ) : raw ? (
        <div className="value-out">
          <span className="value-note">Digite uma odd maior que 1 (ex.: 1.85).</span>
        </div>
      ) : null}
    </div>
  )
}
