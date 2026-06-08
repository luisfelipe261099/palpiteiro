// Painel de admin (rota secreta #admin) para abastecer os códigos de aposta
// (booking codes) da Betano dos "Bilhetes do dia".
//
// Fluxo diário: abrir #admin -> ver os 3 bilhetes que o modelo gerou hoje
// (com os jogos e palpites exatos) -> montar cada um na Betano e gerar o código
// (Compartilhar -> Copiar) -> colar aqui -> Salvar. Os códigos aparecem na hora
// para todos os usuários (via /api/bilhetes), sem deploy.
import { useState, useEffect, useMemo } from 'react'
import { useMatches } from '../hooks/useMatches.js'
import { buildDailyTickets } from '../lib/tickets.js'
import { fetchBetanoCodes, saveBetanoCodes, todayKey } from '../lib/betanoCodes.js'

const SECRET_KEY = 'palpiteiro_admin_secret'
const inputStyle = {
  width: '100%',
  marginTop: 10,
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid var(--stroke)',
  borderRadius: 'var(--r-sm)',
  padding: '11px 13px',
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.5px',
}

export default function Admin() {
  const { groups, loading } = useMatches()
  const now = new Date()
  const daySeed = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const date = todayKey()
  const tickets = useMemo(() => buildDailyTickets(groups, daySeed), [groups, daySeed])

  const [secret, setSecret] = useState(() => localStorage.getItem(SECRET_KEY) || '')
  const [codes, setCodes] = useState({})
  const [status, setStatus] = useState(null) // { ok, msg }
  const [saving, setSaving] = useState(false)

  // carrega códigos já salvos do dia, para edição
  useEffect(() => {
    fetchBetanoCodes(date).then((c) => setCodes((p) => ({ ...c, ...p })))
  }, [date])

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const saved = await saveBetanoCodes(date, codes, secret)
      localStorage.setItem(SECRET_KEY, secret)
      setCodes(saved)
      setStatus({ ok: true, msg: 'Códigos salvos! Já aparecem para os usuários.' })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="wrap" style={{ paddingBottom: 60 }}>
      <h2 style={{ margin: '18px 0 4px' }}>Admin · Bilhetes do dia</h2>
      <p className="intro">
        Data <b>{date}</b>. Monte cada bilhete abaixo na Betano, gere o código (<b>Compartilhar → Copiar</b>) e
        cole no campo correspondente. Clique em <b>Salvar</b> — os códigos aparecem na hora para todos.
      </p>

      {loading && (
        <div className="state">
          <span className="spin" />
          Carregando jogos do dia…
        </div>
      )}

      {!loading && !tickets.length && (
        <p className="intro" style={{ textAlign: 'center', padding: '24px 0' }}>
          Sem bilhetes para hoje (sem jogos com previsão confiável).
        </p>
      )}

      {tickets.map((t) => (
        <div className="card" key={t.key}>
          <div className="card-top">
            <span className={`badge ${t.cls}`}>
              {t.title} · {t.games.length} jogos · @{t.odd.toFixed(2)}
            </span>
          </div>
          <div className="ticket-games">
            {t.games.map((g) => (
              <div className="tg" key={g.matchId}>
                <div className="tg-main">
                  <div className="tg-match">
                    {g.match} · {g.league} · {g.time}
                  </div>
                  <div className="tg-pick">{g.pickLabel}</div>
                </div>
                <div className="tg-odd">@{g.odd.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <input
            style={inputStyle}
            placeholder={`Código Betano do ${t.title}`}
            value={codes[t.key] || ''}
            onChange={(e) => setCodes((p) => ({ ...p, [t.key]: e.target.value }))}
          />
        </div>
      ))}

      <input
        style={inputStyle}
        type="password"
        placeholder="Senha de admin"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
      />
      <button
        className="ready-betano-btn"
        disabled={saving || !secret}
        style={{ opacity: saving || !secret ? 0.6 : 1 }}
        onClick={save}
      >
        {saving ? 'Salvando…' : 'Salvar códigos'}
      </button>
      {status && (
        <div className="state" style={{ color: status.ok ? 'var(--accent)' : 'tomato' }}>
          {status.msg}
        </div>
      )}
    </main>
  )
}
