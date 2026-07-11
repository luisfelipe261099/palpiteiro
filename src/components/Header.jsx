import { RefreshCw, Swords, Ticket, Radio } from 'lucide-react'

export default function Header({ view, onView, onRefresh, refreshing, liveNow }) {
  return (
    <header className="header">
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="logo">
              <img src="/nezaopalpite-logo.svg" alt="Logo Nezaopalpite" />
            </div>
            <div>
              <div className="title">
                Nezaopalpite<span className="accent"> ⚡</span>
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
          <button className="vbtn" data-active={view === 'live'} onClick={() => onView('live')}>
            <Radio size={15} /> Ao Vivo
            {liveNow && <span className="nav-livedot" />}
          </button>
          <button className="vbtn" data-active={view === 'ready'} onClick={() => onView('ready')}>
            <Ticket size={15} /> Bilhetes
          </button>
        </div>
      </div>
    </header>
  )
}
