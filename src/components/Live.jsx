import { Radio } from 'lucide-react'
import LiveMatchCard from './LiveMatchCard.jsx'
import { useLive } from '../hooks/useLive.js'
import { liveState, tsToDate } from '../lib/live.js'

// Aba Ao Vivo: jogos de HOJE com placar e probabilidades recalculadas em
// tempo quase real (polling da API; o placar pode atrasar alguns minutos).
export default function Live({ groups, loading, error }) {
  const { events, at, matches } = useLive(groups, true)

  if (loading) {
    return (
      <>
        <div className="state">
          <span className="spin" />
          Carregando os jogos de hoje…
        </div>
        <div className="skel" />
      </>
    )
  }
  if (error) return <div className="state">{error}</div>

  const now = new Date()
  const withState = matches
    .map((m) => ({ m, st: liveState(m, events[m.id], now) }))
    .sort((a, b) => (tsToDate(a.m.ts)?.getTime() || 0) - (tsToDate(b.m.ts)?.getTime() || 0))

  const live = withState.filter(({ st }) => st.phase === 'live' || st.phase === 'ht')
  const upcoming = withState.filter(({ st }) => st.phase === 'pre')
  const done = withState.filter(({ st }) => st.phase === 'ft' || st.phase === 'off')

  if (!withState.length) {
    // sem jogos hoje: aponta o próximo jogo conhecido
    const next = groups
      .flatMap((g) => g.matches)
      .map((m) => ({ m, d: tsToDate(m.ts) }))
      .filter(({ d }) => d && d > now)
      .sort((a, b) => a.d - b.d)[0]
    return (
      <div className="empty-tickets">
        <Radio size={34} strokeWidth={1.5} />
        <div className="empty-title">Nenhum jogo hoje</div>
        <p>
          {next
            ? `O próximo jogo acompanhado é ${next.m.home.name} x ${next.m.away.name} (${next.m.time}).`
            : 'Sem jogos na janela atual. Volte na próxima rodada.'}
        </p>
      </div>
    )
  }

  let idx = 0
  const section = (title, list, cls = '') =>
    list.length > 0 && (
      <div key={title}>
        <div className={`live-section ${cls}`}>{title}</div>
        {list.map(({ m, st }) => (
          <LiveMatchCard key={m.id} match={m} state={st} index={idx++} />
        ))}
      </div>
    )

  return (
    <>
      <p className="intro">
        Jogos de <b>hoje</b> com placar e probabilidades <b>recalculadas ao vivo</b> conforme o jogo acontece.
        {at && (
          <>
            {' '}
            <span className="live-updated">
              Atualizado {at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · placar pode
              atrasar alguns minutos.
            </span>
          </>
        )}
      </p>
      {section('● Rolando agora', live, 'on')}
      {section('Ainda hoje', upcoming)}
      {section('Encerrados', done)}
    </>
  )
}
