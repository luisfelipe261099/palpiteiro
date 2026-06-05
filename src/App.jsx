import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import Header from './components/Header.jsx'
import LeagueGroup from './components/LeagueGroup.jsx'
import ReadyTickets from './components/ReadyTickets.jsx'
import BetSlip from './components/BetSlip.jsx'
import { useMatches } from './hooks/useMatches.js'
import { predict, bestPick, tier } from './lib/poisson.js'

export default function App() {
  const { groups, loading, error, reload } = useMatches()
  const [view, setView] = useState('matches') // matches | ready
  const [filter, setFilter] = useState('all')

  // aplica o filtro de risco por grupo
  const filtered = useMemo(() => {
    if (filter === 'all') return groups
    return groups
      .map((g) => ({
        ...g,
        matches: g.matches.filter((m) => {
          const pr = predict(m)
          return tier(bestPick(pr, m).p).cls === filter
        }),
      }))
      .filter((g) => g.matches.length)
  }, [groups, filter])

  let runningIndex = 0

  return (
    <>
      <Header
        view={view}
        onView={setView}
        filter={filter}
        onFilter={setFilter}
        onRefresh={() => reload({ fresh: true })}
        refreshing={loading}
      />

      <main className="wrap">
        {view === 'ready' ? (
          <ReadyTickets groups={groups} loading={loading} error={error} />
        ) : (
          <>
            <p className="intro">
              Probabilidades por modelo estatístico (Poisson) a partir de <b>dados reais</b> de classificação,
              força ofensiva/defensiva e forma recente. Toque em <b>+ Bilhete</b> para montar sua aposta.
            </p>

            {loading && (
              <>
                <div className="state">
                  <span className="spin" />
                  Carregando jogos e estatísticas reais…
                </div>
                <div className="skel" />
                <div className="skel" />
              </>
            )}

            {!loading && error && (
              <div className="state">
                {error}
                <br />
                <button className="retry" onClick={() => reload({ fresh: true })}>
                  Tentar de novo
                </button>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <p className="intro" style={{ textAlign: 'center', padding: '30px 0' }}>
                Nenhum jogo nesta categoria agora.
              </p>
            )}

            {!loading &&
              !error &&
              filtered.map((group) => {
                const start = runningIndex
                runningIndex += group.matches.length
                return <LeagueGroup key={group.id} group={group} startIndex={start} />
              })}
          </>
        )}

        <div className="disclaimer">
          <AlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> <b>Aviso:</b> estes são{' '}
          <b>palpites estatísticos</b>, não garantias. Nenhum modelo prevê futebol com certeza — zebra acontece, e
          as casas de aposta já embutem margem própria. No longo prazo, apostar tende a dar prejuízo. Use apenas
          como entretenimento, nunca aposte o que não pode perder. +18. Se a aposta deixou de ser diversão, procure
          ajuda: <b>0800 580 5006</b> (Jogadores Anônimos).
        </div>

        <footer className="footer">
          LuisPalpite ⚡ · Dados ao vivo via <b>TheSportsDB</b> · Análise IA via <b>Google Gemini</b>.
          <br />
          Feito para fins informativos e de entretenimento.
        </footer>
      </main>

      <BetSlip />
    </>
  )
}
