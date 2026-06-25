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
das últimas ~6 rodadas (`eventsround.php?id=&r=&s=`), que vêm completos (10 jogos/rodada).
Jogos futuros vêm da rodada atual. `src/lib/api.js` tem cache (5min) + retry/backoff (429/5xx).

**Modelo (melhorado):** o histórico agora é usado de forma mais rica em `computeStrength`
(`matches.js`) e `predict` (`poisson.js`):
- **Mando real:** força separada casa/fora (`attH/defH/attA/defA`) e médias de gols de
  mandante/visitante (`muHome/muAway`) derivadas dos dados — a vantagem de mando deixa de
  ser a constante `HOME_ADV` (que vira só fallback).
- **Recência:** rodadas mais recentes pesam mais (`RECENCY_DECAY=0.85`).
- **Regularização:** encolhimento bayesiano (`SHRINK_K=3.5`) puxa a força para 1.0 quando há
  poucos jogos, matando ruído de amostra pequena.
- **Ajuste por adversário (strength-of-schedule):** em 2º passo, cada gol é ponderado pela
  força (bruta) do adversário enfrentado — marcar contra defesa forte vale mais que contra
  defesa fraca (`gf/rawDef[opp]`); sofrer de ataque fraco conta mais (`ga/rawAtt[opp]`).
  Fatores limitados (`clampFactor`) p/ não explodir com amostra pequena.
- **Forma na conta:** times embalados ganham gols esperados (`FORM_W`), antes a forma só era
  exibida.
- **Dixon-Coles:** correção `rho=-0.06` para placares baixos (empates/0-0/1-1 mais calibrados).
- **Palpite (`bestPick`):** escolhe entre 1X2, dupla chance, over/under 2.5 e ambas marcam —
  favorito claro → resultado seco; senão tendência de gols; senão dupla chance segura.
Seleções (sede neutra) usam `muHome=muAway=leagueAvg` (sem mando) e força por ranking.

**Outro gotcha:** a chave `3` é compartilhada e bloqueia o IP sob rajada de requisições
(retorna `HTTP 000`/conexão recusada, não 429). Testar com moderação.

Ligas ativas são autodetectadas (em junho/2026 só Brasileirão A e MLS; europeias em recesso).
Análise IA via Google Gemini (`gemini-2.5-flash` + google_search); chave do `.env` ou
sobrescrita em `localStorage` (`palpiteiro_gemini`) pelo botão ⚙️.
