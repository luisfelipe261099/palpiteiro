import { motion } from 'framer-motion'
import { Plus, Check } from 'lucide-react'
import TeamCrest from './TeamCrest.jsx'
import FormPills from './FormPills.jsx'
import ProbBar from './ProbBar.jsx'
import AiPanel from './AiPanel.jsx'
import { predict, bestPick, tier, toOdd, pct } from '../lib/poisson.js'
import { useBetSlip } from '../context/BetSlipContext.jsx'

function reason(m, pr) {
  const fav = pr.pH > pr.pA ? m.home : m.away
  const f = fav.form
  const wins = f.filter((x) => x === 'W').length
  const formTxt = f.length ? `venceu ${wins} dos últimos ${f.length}` : 'tem ataque/defesa superiores'
  return (
    <>
      Por quê: <b>{fav.name}</b> {formTxt}. Gols esperados{' '}
      <b>
        {pr.expH.toFixed(1)}–{pr.expA.toFixed(1)}
      </b>
      . Chance de ambas marcarem <b>{pct(pr.btts)}%</b>.
    </>
  )
}

export default function MatchCard({ match, index, onNeedKey }) {
  const pr = predict(match)
  const pick = bestPick(pr, match)
  const t = tier(pick.p)
  const odd = toOdd(pick.p)
  const bestKey = pr.pH >= pr.pD && pr.pH >= pr.pA ? 'H' : pr.pA >= pr.pD ? 'A' : 'D'

  const { has, toggle } = useBetSlip()
  const id = `${match.id}:${pick.key}`
  const added = has(id)

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.4) }}
    >
      <div className="card-top">
        <span className="meta">{match.time}</span>
        <span className={`badge ${t.cls}`}>
          {t.txt} · {pct(pick.p)}%
        </span>
      </div>

      <div className="teams">
        <div className="team">
          <TeamCrest team={match.home} />
          <div className="tname">{match.home.name}</div>
          <FormPills form={match.home.form} />
        </div>
        <div className="vs">VS</div>
        <div className="team">
          <TeamCrest team={match.away} />
          <div className="tname">{match.away.name}</div>
          <FormPills form={match.away.form} />
        </div>
      </div>

      <div className="probs">
        <ProbBar label="Casa" p={pr.pH} color={match.home.color} best={bestKey === 'H'} />
        <ProbBar label="Empate" p={pr.pD} color="#6b7587" best={bestKey === 'D'} />
        <ProbBar label="Fora" p={pr.pA} color={match.away.color} best={bestKey === 'A'} />
      </div>

      <div className="extra">
        <div className="chip">
          <div className="k">Ambas marcam</div>
          <div className="v">{pct(pr.btts)}%</div>
        </div>
        <div className="chip">
          <div className="k">+2.5 gols</div>
          <div className="v">{pct(pr.over25)}%</div>
        </div>
        <div className="chip">
          <div className="k">Placar provável</div>
          <div className="v">
            {Math.round(pr.expH)}-{Math.round(pr.expA)}
          </div>
        </div>
      </div>

      <div className="pick">
        <div>
          <div className="lbl">Palpite sugerido</div>
          <div className="val">
            {pick.label} <span className="odds">@{odd.toFixed(2)}</span>
          </div>
        </div>
        <button
          className={`addbtn ${added ? 'added' : ''}`}
          onClick={() =>
            toggle({
              id,
              match: `${match.home.short} x ${match.away.short}`,
              pickLabel: pick.label,
              p: pick.p,
              odd,
            })
          }
        >
          {added ? (
            <>
              <Check size={15} /> No bilhete
            </>
          ) : (
            <>
              <Plus size={15} /> Bilhete
            </>
          )}
        </button>
      </div>

      {match.predictable ? (
        <div className="why">{reason(match, pr)}</div>
      ) : (
        <div className="why" style={{ color: 'var(--mid)' }}>
          ⚠️ Previsão preliminar: sem histórico recente na competição (ex.: início de torneio). Os números ficam
          mais precisos conforme novas rodadas são disputadas.
        </div>
      )}

      <AiPanel home={match.home.name} away={match.away.name} league={match.league} onNeedKey={onNeedKey} />
    </motion.div>
  )
}
