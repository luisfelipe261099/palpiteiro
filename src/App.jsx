import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import Header from './components/Header.jsx'
import SearchBar from './components/SearchBar.jsx'
import LeagueGroup from './components/LeagueGroup.jsx'
import ReadyTickets from './components/ReadyTickets.jsx'
import BetSlip from './components/BetSlip.jsx'
import { useMatches } from './hooks/useMatches.js'

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export default function App() {
  const { groups, loading, error, reload } = useMatches()
  const [view, setView] = useState('matches') // matches | ready
  const [query, setQuery] = useState('')

  // aplica busca por texto (time, jogo ou liga)
  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        matches: g.matches.filter((m) => {
          const hay = norm(`${m.home.name} ${m.away.name} ${m.home.short} ${m.away.short} ${g.name}`)
          return hay.includes(q)
        }),
      }))
      .filter((g) => g.matches.length)
  }, [groups, query])

  let runningIndex = 0

  return (
    <>
      <Header
        view={view}
        onView={setView}
        onRefresh={() => reload({ fresh: true })}
        refreshing={loading}
      />

      <main className="wrap">
        {view === 'ready' ? (
          <ReadyTickets groups={groups} loading={loading} error={error} />
        ) : (
          <>
            <p className="intro">
              Jogos de <b>hoje e amanhã</b> com probabilidades por modelo estatístico (Poisson) a partir de{' '}
              <b>dados reais</b> de classificação, força e forma. Toque em <b>+ Bilhete</b> para montar sua aposta.
            </p>

            {!loading && !error && groups.length > 0 && <SearchBar value={query} onChange={setQuery} />}

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
                {query.trim()
                  ? `Nenhum jogo encontrado para “${query.trim()}”.`
                  : 'Nenhum jogo disponível agora.'}
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
