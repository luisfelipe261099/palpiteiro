// Competições candidatas. O app detecta automaticamente quais têm jogos
// futuros agora; as fora de temporada/recesso são ignoradas. IDs errados
// são inofensivos (a competição simplesmente não aparece).
//
// Copas (mata-mata/seleções) vêm primeiro para terem prioridade quando
// ativas. Em junho/2026, por ex., a Copa do Mundo está acontecendo e as
// ligas europeias / Champions estão em recesso.
//
// IDs abaixo foram conferidos via API (TheSportsDB).
// Obs.: Copa Libertadores / Sudamericana / Copa do Brasil não puderam ser
// incluídas porque o endpoint de listagem da chave gratuita vem truncado e
// não expõe esses IDs. Com uma chave registrada dá para adicioná-las.
export const LEAGUES = [
  // ── Seleções / mundiais ── (kind 'nation' usa força por ranking quando
  //    ainda não há histórico no torneio)
  { id: '4429', name: 'FIFA World Cup', local: 'Copa do Mundo', flag: '🏆', kind: 'nation' },
  { id: '4503', name: 'FIFA Club World Cup', local: 'Mundial de Clubes', flag: '🌍' },
  { id: '4502', name: 'UEFA European Championship', local: 'Eurocopa', flag: '🇪🇺', kind: 'nation' },
  // ── Continentais de clubes (Europa) ──
  { id: '4480', name: 'UEFA Champions League', local: 'Champions League', flag: '⭐' },
  { id: '4481', name: 'UEFA Europa League', local: 'Europa League', flag: '🟠' },
  { id: '5071', name: 'UEFA Conference League', local: 'Conference League', flag: '🟢' },
  // ── Ligas nacionais ──
  { id: '4351', name: 'Brazilian Serie A', local: 'Brasileirão Série A', flag: '🇧🇷' },
  { id: '4350', name: 'Brazilian Serie B', local: 'Brasileirão Série B', flag: '🇧🇷' },
  { id: '4346', name: 'American Major League Soccer', local: 'MLS', flag: '🇺🇸' },
  { id: '4328', name: 'English Premier League', local: 'Premier League', flag: '🏴' },
  { id: '4335', name: 'Spanish La Liga', local: 'La Liga', flag: '🇪🇸' },
  { id: '4332', name: 'Italian Serie A', local: 'Serie A (ITA)', flag: '🇮🇹' },
  { id: '4331', name: 'German Bundesliga', local: 'Bundesliga', flag: '🇩🇪' },
  { id: '4334', name: 'French Ligue 1', local: 'Ligue 1', flag: '🇫🇷' },
  { id: '4344', name: 'Portuguese Primeira Liga', local: 'Primeira Liga', flag: '🇵🇹' },
  { id: '4337', name: 'Dutch Eredivisie', local: 'Eredivisie', flag: '🇳🇱' },
]

export const MAX_LEAGUES_SHOWN = 7 // limita carga / rate-limit
export const HOME_ADV = 1.12 // fator de mando de campo
