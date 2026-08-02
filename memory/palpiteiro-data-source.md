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

**Fonte de dados:** API **TheSportsDB** (chave pública **`123`** desde ago/2026).
CORS aberto, funciona client-side.

**Gotcha não óbvio — CHAVES:** em ago/2026 a chave pública `3` passou a truncar
`eventsround.php` em ~5 eventos (metade de uma rodada da Série A!) e
`eventsseason.php` em 5 — isso zerava força/forma e esvaziava os bilhetes.
A chave pública `123` retorna a RODADA COMPLETA (10/10 verificado) e
`eventsseason` até 15. Padrão do app mudado para `123` (api.js/.env.example).
Truncamentos que PERMANECEM mesmo na `123`:
- `eventsnextleague.php` → só 1 evento.
- `eventspastleague.php` / `eventslast.php` → só 1 evento.
- `eventsday.php` → ~3 eventos/dia. A descoberta de ligas nacionais NÃO pode
  depender só dele: `matches.js` roda `eventsnextleague` + `eventsround` para
  TODAS as ligas nacionais (discoverLeagueViaNext) e mescla fixtures.
- `eventsround.php` é a base de tudo: força/forma calculadas dele.

**Janela de exibição:** hoje+amanhã (eventsday) + **próxima rodada em até 7
dias** por liga nacional (LEAGUE_LOOKAHEAD_DAYS) — sem isso, num domingo sem
rodada (ex.: 02/08/2026, rodada só sex/sáb) o app e os bilhetes ficavam
vazios. Copas continuam com 10 dias. Jogos `strStatus PST`/`strPostponed
'yes'` são descartados (isPostponed em keepEvent — a API mantém a data velha).

**Copa do Brasil (4725) — feeders:** os times quase não têm histórico DENTRO
da copa → tudo virava "preliminar" e fora dos bilhetes. Solução: `feeders` em
leagues.js — empresta força da Série A (factor 1) e Série B (factor 0.85,
rebaixa a divisão inferior: att*f, def/f) via registro compartilhado
(`strengthReg` em loadAllLeagues + ensureFeederStrength). A ordem de LEAGUES
importa: Série A/B carregam antes da Copa do Brasil e alimentam o registro.

**Rodadas de mata-mata (intRound):** códigos especiais — `125` = quartas,
`150` = semi, `160`/`200` = 3º lugar/final (KNOCKOUT_ROUNDS em matches.js).
`computeStrength` não pode fazer `round-1` nesses casos (rodada 124 não
existe); usa grupos (1..3) + fases já disputadas. `discoverCupWide` busca
também as fases seguintes já agendadas dentro da janela de 10 dias.

**Bilhetes do dia (tickets.js):** pool com até 4 mercados por jogo (resultado,
dupla chance do favorito, +/-2.5 gols, ambas marcam). Bilhetes diferentes podem
reusar o mesmo jogo em mercados diferentes (essencial no mata-mata, com 1–2
jogos/dia); dentro de um bilhete, 1 palpite por jogo e no máx. 2 pernas de
gols/btts (diversificação). Perfis por "centro" de probabilidade com pisos
(safe 0.80/minP 0.62/minConf 0.35 · mid 0.60/0.45 · risk 0.42/0.33),
determinístico por daySeed. `buildDailyTickets` retorna `{tickets, dayStart,
matchCount}`: se hoje não tem rodada, monta para o PRÓXIMO dia com jogos
(span de 2 dias a partir dele) e a UI avisa ("bilhetes para sexta 07/08").
`toOdd = max(1.01, (1/p)*0.94)` — margem DESCONTADA como casa real (antes
*1.06 inflava odds e superestimava retorno no simulador). Mercados de
gols/btts só entram no pool com p≥0.55 (no backtest, pernas ~50-54%
acertavam como moeda).

**IDs de competição verificados (via WebFetch):** 4429 Copa do Mundo, 4503 Mundial
de Clubes (FIFA Club WC), 4502 Eurocopa, 4480 Champions, 4481 Europa League, 5071
Conference League. Ligas: 4351 Brasileirão A, **4404 Série B** (CUIDADO: 4350 parece
Série B mas é a liga MEXICANA — bug que escondeu a Série B até jul/2026), 4725 Copa
do Brasil, 4625 Série C, 4346 MLS, 4328 Premier, 4335 La Liga, 4332 Serie A ITA,
4331 Bundesliga, 4334 Ligue 1, 4344 Primeira, 4337 Eredivisie. IDs brasileiros saem
de `search_all_leagues.php?c=Brazil` (truncado a ~5, mas mostrou os principais).
Libertadores/Sudamericana: IDs não obtidos — precisam de chave registrada.

**Copas em rodada 1 (sem histórico):** times ficam sem força calculável → match marcado
`predictable:false` e o card mostra aviso "previsão preliminar" em vez de números falsos.
Em junho/2026 a Copa do Mundo (4429) está ativa; Champions/europeias em recesso.

**Solução adotada:** força ofensiva/defensiva e forma são calculadas dos RESULTADOS reais
das últimas ~6 rodadas (`eventsround.php?id=&r=&s=`), com melhorias de calibração:
- **decaimento por rodada** (0.85^idade — rodada recente pesa mais);
- **encolhimento bayesiano** (**PRIOR_GAMES=6**, calibrado por backtest) —
  prior 3 dava palpites 67,5% certeiros; prior 6 dá 72-77% (n=576 jogos reais);
- **mando de campo medido na amostra** (golsCasa/golsFora, clamp 1.02–1.30; seleção = 1.0);
- **seleções: blend** histórico do torneio × ranking curado, peso n/(n+3);
- **Poisson com correção de Dixon-Coles** (rho=-0.11; parametrizável via
  `predict(m, {rho})`) em poisson.js, expH/expA clamp 0.2–4.5, `topScores`
  (3 placares mais prováveis da grade — usados no card);
- **btts/over25 CALIBRADOS**: o modelo cru superestimava gols (+2.5 previsto
  51%×real 47%) — predict() aplica shift (-0.035 over / -0.025 btts) +
  encolhimento 0.9 rumo a 50%; depois disso previsto≈real no backtest;
- `bestPick` só sugere vitória simples com p≥0.60 (senão dupla chance) —
  na faixa exibida 50-60% o acerto real era só ~38%;
- cada match tem `conf` 0..1 (lastro de dados; min dos dois lados) — mostrado
  como selo no MatchCard e usado como bônus de score nos bilhetes (safe pesa mais).

**Backtest (scripts/backtest.mjs):** roda o modelo contra rodadas REAIS já
disputadas (Série A/B 2026 + Premier 2025-26, ~576 jogos): treina só com as
rodadas anteriores à alvo, mede acc 1X2, Brier, acerto do bestPick, o/u, btts
e calibração por faixa. Cacheia respostas em `.backtest-cache/` (gitignored) —
re-rodar é grátis. computeStrength/predict/bestPick aceitam opts p/ variar
hiperparâmetros. SEMPRE re-rodar antes de mexer em parâmetro de modelo.
Jogos futuros vêm da rodada atual. `src/lib/api.js` tem cache (5min) + retry/backoff (429/5xx).

**Outro gotcha:** a chave `3` é compartilhada e bloqueia o IP sob rajada de requisições
(retorna `HTTP 000`/conexão recusada, não 429). Testar com moderação.

**Ao Vivo (aba):** livescore de verdade é premium na TheSportsDB, MAS
`lookupevent.php` (chave 3) atualiza `intHomeScore/intAwayScore` e `strStatus`
(1H/HT/2H/FT/AET/PEN/PST…) durante o jogo, com atraso de minutos. `src/lib/live.js`
faz polling (75s, só com a aba visível) + estima o minuto pelo relógio (kickoff
+ pausa de 15min p/ intervalo) e recalcula 1X2/over/btts condicionando o Poisson
pré-jogo ao placar atual e tempo restante (gols esperados restantes ∝ tempo).
GOTCHA: jogos com placar eram filtrados por `isUnplayed` e SUMIAM do app ao
começar — `keepEvent` mantém eventos de HOJE (started:true), que ficam fora de
Partidas/bilhetes e vivem só na aba Ao Vivo. O anchor do `eventsnextleague`
(1 evento só) também pode ser o jogo em andamento.

Ligas ativas são autodetectadas (em junho/2026 só Brasileirão A e MLS; europeias em recesso).
Análise IA via Google Gemini (`gemini-2.5-flash` + google_search); chave do `.env` ou
sobrescrita em `localStorage` (`palpiteiro_gemini`) pelo botão ⚙️.
