import { Zap, RefreshCw, Swords, Ticket } from 'lucide-react'

const TABS = [
  { filter: 'all', label: 'Todos', color: null },
  { filter: 'safe', label: 'Seguros', color: 'var(--safe)' },
  { filter: 'mid', label: 'Médios', color: 'var(--mid)' },
  { filter: 'risk', label: 'Arriscados', color: 'var(--risk)' },
]

export default function Header({ view, onView, filter, onFilter, onRefresh, refreshing }) {
  return (
    <header className="header">
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="logo">
              <Zap size={22} fill="#04140d" />
            </div>
            <div>
              <div className="title">
                LuisPalpite<span className="accent"> ⚡</span>
              </div>
              <div className="sub">Estatísticas & palpites · dados reais</div>
            </div>
          </div>
          <div className="head-actions">
            <button className="live" onClick={onRefresh} title="Atualizar dados">
              <span className="dot" />
              {refreshing ? <RefreshCw size={13} className="spin-ico" /> : 'AO VIVO'}
            </button>
          </div>
        </div>
        <div className="viewnav">
          <button className="vbtn" data-active={view === 'matches'} onClick={() => onView('matches')}>
            <Swords size={15} /> Partidas
          </button>
          <button className="vbtn" data-active={view === 'ready'} onClick={() => onView('ready')}>
            <Ticket size={15} /> Bilhetes do dia
          </button>
        </div>

        {view === 'matches' && (
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.filter}
                className="tab"
                data-active={filter === t.filter}
                onClick={() => onFilter(t.filter)}
              >
                {t.color && <span className="cdot" style={{ background: t.color }} />}
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
