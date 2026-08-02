import { motion } from 'framer-motion'
import { Plus, Check } from 'lucide-react'
import TeamCrest from './TeamCrest.jsx'
import FormPills from './FormPills.jsx'
import ProbBar from './ProbBar.jsx'
import AiPanel from './AiPanel.jsx'
import { predict, bestPick, tier, toOdd, pct } from '../lib/poisson.js'
import { useBetSlip } from '../context/BetSlipContext.jsx'

// resumo da forma: "3V-1E-1D" (ou null sem jogos)
function formTxt(f) {
  if (!f || !f.length) return null
  const w = f.filter((x) => x === 'W').length
  const d = f.filter((x) => x === 'D').length
  return `${w}V-${d}E-${f.length - w - d}D`
}

// análise em linguagem natural montada dos números do modelo: forma dos dois
// lados, ataque/defesa vs média da liga e fator casa. Só afirma o que os
// dados sustentam (cada trecho tem um limiar mínimo para entrar no texto).
function reason(m, pr) {
  const favHome = pr.pH >= pr.pA
  const fav = favHome ? m.home : m.away
  const dog = favHome ? m.away : m.home
  const gap = Math.abs(pr.pH - pr.pA)

  const bits = []
  const ff = formTxt(fav.form)
  if (ff) bits.push(<>vem de <b>{ff}</b> nos últimos jogos</>)
  if (fav.att >= 1.06) bits.push(<>ataque <b>{Math.round((fav.att - 1) * 100)}% acima</b> da média da liga</>)
  if (dog.def >= 1.06)
    bits.push(<>a defesa do {dog.short} sofre <b>{Math.round((dog.def - 1) * 100)}% mais gols</b> que a média</>)
  if (favHome && (m.homeAdv || 1.12) >= 1.05) bits.push(<>joga <b>em casa</b></>)
  if (!favHome) bits.push(<>mesmo <b>jogando fora</b></>)

  const df = formTxt(dog.form)
  return (
    <>
      Por quê: {gap < 0.08 ? <>jogo <b>equilibrado</b> — <b>{fav.name}</b> tem leve vantagem</> : <b>{fav.name}</b>}
      {bits.map((b, i) => (
        <span key={i}>
          {i === 0 ? ' ' : i === bits.length - 1 ? ' e ' : ', '}
          {b}
        </span>
      ))}
      . {df ? <>Do outro lado, {dog.name} vem de {df}. </> : null}
      Gols esperados{' '}
      <b>
        {pr.expH.toFixed(1)}–{pr.expA.toFixed(1)}
      </b>
      {pr.topScores && pr.topScores.length ? (
        <>
          ; placares mais prováveis:{' '}
          {pr.topScores.slice(0, 2).map((s, i) => (
            <span key={i}>
              {i > 0 && ' e '}
              <b>
                {s.h}-{s.a}
              </b>{' '}
              ({pct(s.p)}%)
            </span>
          ))}
        </>
      ) : null}
      .
    </>
  )
}

export default function MatchCard({ match, index }) {
  const pr = predict(match)
  const pick = bestPick(pr, match)
  const t = tier(pick.p)
  const odd = toOdd(pick.p)
  const bestKey = pr.pH >= pr.pD && pr.pH >= pr.pA ? 'H' : pr.pA >= pr.pD ? 'A' : 'D'
  // sem dados reais dos dois lados, o modelo devolve números "neutros"
  // idênticos para qualquer jogo (ex.: placar 1-1 em todos os cards) —
  // nesses casos os chips mostram "—" em vez de estatística falsa.
  const noData = !match.predictable || match.preliminary

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
          <div className="v">{noData ? '—' : `${pct(pr.btts)}%`}</div>
        </div>
        <div className="chip">
          <div className="k">+2.5 gols</div>
          <div className="v">{noData ? '—' : `${pct(pr.over25)}%`}</div>
        </div>
        <div className="chip">
          <div className="k">Placar provável</div>
          <div className="v">
            {noData
              ? '—'
              : pr.topScores && pr.topScores.length
                ? `${pr.topScores[0].h}-${pr.topScores[0].a} (${pct(pr.topScores[0].p)}%)`
                : `${Math.round(pr.expH)}-${Math.round(pr.expA)}`}
          </div>
        </div>
      </div>

      <div className="pick">
        <div>
          <div className="lbl">
            Palpite sugerido
            {match.conf != null && (
              <span className={`conf-tag ${match.conf >= 0.65 ? 'safe' : match.conf >= 0.35 ? 'mid' : 'risk'}`}>
                dados: {match.conf >= 0.65 ? 'bons' : match.conf >= 0.35 ? 'médios' : 'fracos'}
              </span>
            )}
          </div>
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

      {match.predictable && !match.preliminary ? (
        <div className="why">{reason(match, pr)}</div>
      ) : (
        <div className="why" style={{ color: 'var(--mid)' }}>
          ⚠️ Previsão preliminar: sem histórico recente na competição nem ranking conhecido das equipes (ex.:
          amistosos de seleções de base/menores, início de torneio). Os números ficam mais precisos conforme
          novas rodadas são disputadas.
        </div>
      )}

      <AiPanel
        home={match.home.name}
        away={match.away.name}
        league={match.league}
        model={{ pH: pr.pH, pD: pr.pD, pA: pr.pA, pickLabel: pick.label }}
      />
    </motion.div>
  )
}
