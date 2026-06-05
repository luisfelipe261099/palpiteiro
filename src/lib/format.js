// Helpers de formatação e identidade visual dos times.

const ABBR = {
  Flamengo: 'FLA', Vasco: 'VAS', 'Vasco da Gama': 'VAS', Palmeiras: 'PAL',
  Corinthians: 'COR', 'Sao Paulo': 'SAO', 'São Paulo': 'SAO', Santos: 'SAN',
  Gremio: 'GRE', Grêmio: 'GRE', Internacional: 'INT', Fluminense: 'FLU',
  Botafogo: 'BOT', 'Atletico Mineiro': 'CAM', 'Atlético Mineiro': 'CAM',
  Cruzeiro: 'CRU', Fortaleza: 'FOR', Bahia: 'BAH', Ceara: 'CEA', Ceará: 'CEA',
  Bragantino: 'RBB', 'Red Bull Bragantino': 'RBB', Juventude: 'JUV',
  'Manchester City': 'MCI', 'Manchester United': 'MUN', Liverpool: 'LIV',
  Arsenal: 'ARS', Chelsea: 'CHE', Tottenham: 'TOT', 'Real Madrid': 'RMA',
  Barcelona: 'BAR', 'Atletico Madrid': 'ATM', 'Bayern Munich': 'BAY',
  'Borussia Dortmund': 'BVB', 'Paris Saint-Germain': 'PSG', Juventus: 'JUV',
  'Inter Milan': 'INT', 'AC Milan': 'MIL', Napoli: 'NAP',
}

export function abbr(name) {
  if (ABBR[name]) return ABBR[name]
  const w = name.replace(/[^A-Za-zÀ-ÿ ]/g, '').split(/\s+/).filter(Boolean)
  if (w.length >= 2) return (w[0][0] + w[1][0] + (w[2] ? w[2][0] : w[1][1] || '')).toUpperCase()
  return name.slice(0, 3).toUpperCase()
}

// cor determinística a partir do nome (fallback de escudo / barras)
export function colorFor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 60% 52%)`
}

export function fmtTime(ts) {
  if (!ts) return 'A definir'
  const iso = ts.replace(' ', 'T')
  const d = new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  if (isNaN(d)) return 'A definir'
  const now = new Date()
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay(d, now)) return `Hoje ${hh}`
  if (sameDay(d, tomorrow)) return `Amanhã ${hh}`
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  return `${dias[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}`
}
