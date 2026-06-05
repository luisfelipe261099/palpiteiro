---
name: palpiteiro-data-source
description: Arquitetura do Palpiteiro (React/Vite), fontes de dados e a limitação da chave gratuita do TheSportsDB
metadata:
  type: project
---

O Palpiteiro é um app de palpites de futebol, agora em **React + Vite** (v2.0).
Estrutura: `src/lib` (api, poisson, matches, gemini, format, leagues), `src/components`,
`src/context/BetSlipContext.jsx`, `src/hooks/useMatches.js`. Chaves em `.env`
(`VITE_TSDB_KEY`, `VITE_GEMINI_KEY`) — `.env` está no `.gitignore`; há `.env.example`.
A versão single-file antiga foi preservada em `public/standalone.html`.
UI premium estilo Apple (glassmorphism, Inter, framer-motion, lucide-react).

**Fonte de dados:** API **TheSportsDB** (chave pública `3`). CORS aberto, funciona client-side.

**Gotcha não óbvio:** a chave gratuita `3` TRUNCA quase tudo:
- `lookuptable.php` → só ~5 times.
- `eventsnextleague.php` → só 1 evento.
- `eventslast.php` → só 1 evento.
- `all_leagues.php` → só ~10 ligas europeias.
- `eventsround.php` é o ÚNICO que vem completo (rodada inteira). Por isso toda
  força/forma é calculada dele.

**IDs de competição verificados (via WebFetch):** 4429 Copa do Mundo, 4503 Mundial
de Clubes (FIFA Club WC), 4502 Eurocopa, 4480 Champions, 4481 Europa League, 5071
Conference League. Ligas: 4351 Brasileirão A, 4350 Série B, 4346 MLS, 4328 Premier,
4335 La Liga, 4332 Serie A ITA, 4331 Bundesliga, 4334 Ligue 1, 4344 Primeira, 4337
Eredivisie. Libertadores/Sudamericana/Copa do Brasil: IDs não obtidos (all_leagues
truncado) — precisam de chave registrada.

**Copas em rodada 1 (sem histórico):** times ficam sem força calculável → match marcado
`predictable:false` e o card mostra aviso "previsão preliminar" em vez de números falsos.
Em junho/2026 a Copa do Mundo (4429) está ativa; Champions/europeias em recesso.

**Solução adotada:** força ofensiva/defensiva e forma são calculadas dos RESULTADOS reais
das últimas ~10 rodadas (`eventsround.php?id=&r=&s=`), que vêm completos (10 jogos/rodada).
`att=(gols feitos/jogo)/médiaLiga`, `def=(gols sofridos/jogo)/médiaLiga`. Alimenta o Poisson.
Jogos futuros vêm da rodada atual. `src/lib/api.js` tem cache (5min) + retry/backoff (429/5xx).

**Outro gotcha:** a chave `3` é compartilhada e bloqueia o IP sob rajada de requisições
(retorna `HTTP 000`/conexão recusada, não 429). Testar com moderação.

Ligas ativas são autodetectadas (em junho/2026 só Brasileirão A e MLS; europeias em recesso).
Análise IA via Google Gemini (`gemini-2.5-flash` + google_search); chave do `.env` ou
sobrescrita em `localStorage` (`palpiteiro_gemini`) pelo botão ⚙️.
