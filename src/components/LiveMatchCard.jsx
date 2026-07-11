import { motion } from 'framer-motion'
import TeamCrest from './TeamCrest.jsx'
import ProbBar from './ProbBar.jsx'
import { predict, bestPick, pct } from '../lib/poisson.js'
import { livePredict, pickHits } from '../lib/live.js'

// Card de jogo na aba Ao Vivo. Três formas:
//  - pre: horário + palpite pré-jogo
//  - live/ht: placar grande, minuto estimado e probabilidades RECALCULADAS
//    (condicionadas ao placar atual e ao tempo restante)
//  - ft: placar final + se o palpite pré-jogo bateu
export default function LiveMatchCard({ match, state, index }) {
  const pre = predict(match)
  const pick = bestPick(pre, match)
  const isLive = state.phase === 'live' || state.phase === 'ht'
  const isFt = state.phase === 'ft'

  const pr = isLive ? livePredict(match, state.hs, state.as, state.frac) : pre
  const bestKey = pr.pH >= pr.pD && pr.pH >= pr.pA ? 'H' : pr.pA >= pr.pD ? 'A' : 'D'

  const hit = isFt || isLive ? pickHits(pick.key, state.hs, state.as) : null

  return (
    <motion.div
      className={`card live-card ${isLive ? 'is-live' : ''}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.3) }}
    >
      <div className="card-top">
        <span className="meta">
          {match.league} · {match.time}
        </span>
        {isLive && (
          <span className="live-badge">
            <span className="live-dot" />
            {state.label}
          </span>
        )}
        {isFt && <span className="badge">{state.label}</span>}
        {state.phase === 'off' && <span className="badge risk">{state.label}</span>}
      </div>

      <div className="live-teams">
        <div className="live-team">
          <TeamCrest team={match.home} />
          <div className="tname">{match.home.name}</div>
        </div>
        <div className="live-score">
          {isLive || isFt ? (
            <>
              <span>{state.hs}</span>
              <span className="live-score-sep">–</span>
              <span>{state.as}</span>
            </>
          ) : (
            <span className="live-vs">vs</span>
          )}
        </div>
        <div className="live-team">
          <TeamCrest team={match.away} />
          <div className="tname">{match.away.name}</div>
        </div>
      </div>

      {isLive && !state.scoreKnown && (
        <div className="live-hint">Jogo em andamento — placar ainda não informado pela fonte de dados.</div>
      )}

      {(isLive || state.phase === 'pre') && match.predictable && (
        <div className="probs">
          <ProbBar label="Casa" p={pr.pH} color={match.home.color} best={bestKey === 'H'} />
          <ProbBar label="Empate" p={pr.pD} color="#6b7587" best={bestKey === 'D'} />
          <ProbBar label="Fora" p={pr.pA} color={match.away.color} best={bestKey === 'A'} />
        </div>
      )}

      {isLive && match.predictable && (
        <div className="extra">
          <div className="chip">
            <div className="k">+2.5 gols agora</div>
            <div className="v">{pct(pr.over25)}%</div>
          </div>
          <div className="chip">
            <div className="k">Ambas marcam</div>
            <div className="v">{pct(pr.btts)}%</div>
          </div>
          <div className="chip">
            <div className="k">Palpite pré-jogo</div>
            <div className="v" style={{ color: hit == null ? undefined : hit ? 'var(--safe)' : 'var(--risk)' }}>
              {hit == null ? '—' : hit ? 'passando ✓' : 'não passa ✗'}
            </div>
          </div>
        </div>
      )}

      {match.predictable && (
        <div className="live-pick">
          <span className="lbl">Palpite pré-jogo</span>
          <span className="val">
            {pick.label} · {pct(pick.p)}%
          </span>
          {isFt && hit != null && (
            <span className={`live-hit ${hit ? 'ok' : 'bad'}`}>{hit ? 'Bateu ✓' : 'Não bateu ✗'}</span>
          )}
        </div>
      )}
    </motion.div>
  )
}
