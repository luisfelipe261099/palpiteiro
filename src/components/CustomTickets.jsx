// Construtor de "bilhetes prontos" pelo próprio dono, protegido por senha.
// Escolhe jogos de HOJE e o mercado de cada um (resultado, dupla chance, gols),
// e salva o bilhete no dispositivo (localStorage) — aparece junto dos bilhetes
// do dia. A senha (2610) é só um cadeado simples no cliente, não segurança real.
import { useState, useMemo } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { predict, marketOptions, bestPick, toOdd, pct } from '../lib/poisson.js'
import { todayPredictableMatches, compose } from '../lib/tickets.js'
import { todayKey } from '../lib/betanoCodes.js'
import ReadyTicketCard from './ReadyTicketCard.jsx'

const PASSWORD = '2610'
const STORE = 'palpiteiro_meus_bilhetes'
const UNLOCK = 'palpiteiro_criador_ok'

function loadSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function persist(list) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export default function CustomTickets({ groups }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(UNLOCK) === '1')
  const [panel, setPanel] = useState(null) // null | 'pw' | 'build'
  const [pw, setPw] = useState('')
  const [pwErr, setPwErr] = useState(false)
  const [saved, setSaved] = useState(loadSaved)

  const [title, setTitle] = useState('Meu bilhete')
  const [clsSel, setClsSel] = useState('mid')
  const [sel, setSel] = useState({}) // matchId -> chave do mercado escolhido

  // jogos de hoje + mercados de cada um (probabilidade já calculada).
  const rows = useMemo(
    () =>
      todayPredictableMatches(groups).map((m) => {
        const pr = predict(m)
        return { m, opts: marketOptions(pr, m), best: bestPick(pr, m).key }
      }),
    [groups],
  )

  const today = todayKey()
  const myTickets = saved.filter((t) => t.date === today)

  const openCreator = () => setPanel(unlocked ? 'build' : 'pw')
  const unlock = () => {
    if (pw.trim() === PASSWORD) {
      setUnlocked(true)
      setPwErr(false)
      setPanel('build')
      try {
        localStorage.setItem(UNLOCK, '1')
      } catch {
        /* ignore */
      }
    } else {
      setPwErr(true)
    }
  }

  const toggle = (row) =>
    setSel((s) => {
      const n = { ...s }
      if (n[row.m.id]) delete n[row.m.id]
      else n[row.m.id] = row.best
      return n
    })
  const setMarket = (id, key) => setSel((s) => ({ ...s, [id]: key }))

  const selectedGames = () => {
    const games = []
    for (const row of rows) {
      const key = sel[row.m.id]
      if (!key) continue
      const opt = row.opts.find((o) => o.key === key) || row.opts[0]
      const m = row.m
      games.push({
        matchId: m.id,
        short: `${m.home.short} x ${m.away.short}`,
        match: `${m.home.name} x ${m.away.name}`,
        league: m.league,
        time: m.time,
        pickLabel: opt.label,
        p: opt.p,
        odd: toOdd(opt.p),
      })
    }
    return games
  }

  const saveTicket = () => {
    const games = selectedGames()
    if (games.length < 2) return
    const { odd, prob } = compose(games)
    const ticket = {
      key: `meu-${Date.now()}`,
      title: title.trim() || 'Meu bilhete',
      cls: clsSel,
      games,
      odd,
      prob,
      date: today,
      custom: true,
    }
    const next = [ticket, ...saved]
    setSaved(next)
    persist(next)
    setSel({})
    setTitle('Meu bilhete')
  }

  const removeTicket = (key) => {
    const next = saved.filter((t) => t.key !== key)
    setSaved(next)
    persist(next)
  }

  const sg = selectedGames()
  const previewOdd = sg.length ? compose(sg).odd : 0

  return (
    <div className="creator-wrap">
      {myTickets.length > 0 && (
        <>
          <h3 className="creator-h2">Meus bilhetes</h3>
          {myTickets.map((t, i) => (
            <div key={t.key} className="creator-saved">
              <ReadyTicketCard ticket={t} index={i} />
              <button className="creator-del" onClick={() => removeTicket(t.key)}>
                <Trash2 size={13} /> Remover bilhete
              </button>
            </div>
          ))}
        </>
      )}

      {panel === null && (
        <button className="creator-toggle" onClick={openCreator}>
          <Plus size={16} /> Criar meu bilhete pronto
        </button>
      )}

      {panel === 'pw' && (
        <div className="card creator-card">
          <div className="creator-h">
            <Lock size={14} /> Área protegida
          </div>
          <p className="creator-note">Digite sua senha para criar bilhetes prontos.</p>
          <input
            className="creator-input"
            type="password"
            inputMode="numeric"
            placeholder="Senha"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value)
              setPwErr(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
          />
          {pwErr && <div className="creator-err">Senha incorreta.</div>}
          <div className="creator-actions">
            <button className="ready-betano-btn" onClick={unlock}>
              Entrar
            </button>
            <button
              className="creator-cancel"
              onClick={() => {
                setPanel(null)
                setPw('')
                setPwErr(false)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {panel === 'build' && unlocked && (
        <div className="card creator-card">
          <div className="creator-h">
            <Plus size={14} /> Novo bilhete pronto
          </div>
          {rows.length === 0 ? (
            <p className="creator-note">Sem jogos de hoje com previsão confiável para montar um bilhete.</p>
          ) : (
            <>
              <div className="creator-fields">
                <input
                  className="creator-input"
                  placeholder="Nome do bilhete"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <select className="creator-select" value={clsSel} onChange={(e) => setClsSel(e.target.value)}>
                  <option value="safe">Seguro (verde)</option>
                  <option value="mid">Médio (amarelo)</option>
                  <option value="risk">Arriscado (vermelho)</option>
                </select>
              </div>

              <div className="creator-list">
                {rows.map((row) => {
                  const on = !!sel[row.m.id]
                  return (
                    <div key={row.m.id} className={`crow ${on ? 'on' : ''}`}>
                      <label className="crow-check">
                        <input type="checkbox" checked={on} onChange={() => toggle(row)} />
                        <span className="crow-match">
                          {row.m.home.short} x {row.m.away.short}
                          <span className="crow-time"> · {row.m.time}</span>
                        </span>
                      </label>
                      <select
                        className="creator-select sm"
                        disabled={!on}
                        value={sel[row.m.id] || row.best}
                        onChange={(e) => setMarket(row.m.id, e.target.value)}
                      >
                        {row.opts.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label} · {pct(o.p)}% · @{toOdd(o.p).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              <div className="creator-foot">
                <span className="creator-note">
                  {sg.length >= 2
                    ? `${sg.length} jogos · odd @${previewOdd.toFixed(2)}`
                    : 'Selecione ao menos 2 jogos'}
                </span>
                <div className="creator-actions">
                  <button
                    className="ready-betano-btn"
                    disabled={sg.length < 2}
                    style={{ opacity: sg.length < 2 ? 0.5 : 1 }}
                    onClick={saveTicket}
                  >
                    Salvar bilhete
                  </button>
                  <button className="creator-cancel" onClick={() => setPanel(null)}>
                    Fechar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
