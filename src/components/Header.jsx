import { Zap, Settings, RefreshCw } from 'lucide-react'

const TABS = [
  { filter: 'all', label: 'Todos', color: null },
  { filter: 'safe', label: 'Seguros', color: 'var(--safe)' },
  { filter: 'mid', label: 'Médios', color: 'var(--mid)' },
  { filter: 'risk', label: 'Arriscados', color: 'var(--risk)' },
]

export default function Header({ filter, onFilter, onOpenSettings, onRefresh, refreshing }) {
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
            <button className="iconbtn" onClick={onOpenSettings} title="Configurar análise IA">
              <Settings size={18} />
            </button>
            <button className="live" onClick={onRefresh} title="Atualizar dados">
              <span className="dot" />
              {refreshing ? <RefreshCw size={13} className="spin-ico" /> : 'AO VIVO'}
            </button>
          </div>
        </div>
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
      </div>
    </header>
  )
}
