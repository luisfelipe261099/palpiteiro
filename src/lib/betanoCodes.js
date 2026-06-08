// Cliente dos códigos de aposta (booking codes) da Betano, servidos por
// /api/bilhetes. Os códigos são atrelados à data local (YYYY-MM-DD) e ao tipo
// de bilhete ('safe' | 'mid' | 'risk').

// data local no formato YYYY-MM-DD (mesma chave usada pelo admin e pelos cards)
export function todayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// busca os códigos do dia. Falha de rede (ex.: rodando local sem /api) retorna
// {} silenciosamente — os cards caem no fluxo antigo de "montar na Betano".
export async function fetchBetanoCodes(date = todayKey()) {
  try {
    const r = await fetch(`/api/bilhetes?date=${date}`)
    if (!r.ok) return {}
    const data = await r.json()
    return data.codes || {}
  } catch {
    return {}
  }
}

// salva os códigos (uso do admin). Lança erro com mensagem amigável.
export async function saveBetanoCodes(date, codes, secret) {
  const r = await fetch('/api/bilhetes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
    body: JSON.stringify({ date, codes }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Erro ${r.status}`)
  return data.codes || {}
}
