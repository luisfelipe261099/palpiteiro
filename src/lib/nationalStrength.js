// Força base de seleções (proxy por ranking estilo FIFA) para competições
// de seleções (Copa do Mundo, Eurocopa) quando ainda NÃO há histórico de
// jogos dentro do torneio — ex.: rodada 1. Assim os jogos já têm previsão
// diferenciada (favorito x azarão) em vez de números genéricos.
//
// att = força ofensiva relativa (1.0 = média) · def = gols sofridos relativos
// (menor = melhor defesa). Conforme o torneio avança, os RESULTADOS reais das
// rodadas passam a ter prioridade sobre esta tabela.

const ELITE = { att: 1.45, def: 0.64 }
const STRONG = { att: 1.28, def: 0.75 }
const GOOD = { att: 1.08, def: 0.9 }
const DEFAULT = { att: 0.88, def: 1.14 } // seleções fora da lista (ranking mais baixo)

const BY_TEAM = {
  // elite
  Argentina: ELITE, France: ELITE, Spain: ELITE, England: ELITE, Brazil: ELITE, Portugal: ELITE,
  // fortes
  Netherlands: STRONG, Germany: STRONG, Italy: STRONG, Belgium: STRONG, Croatia: STRONG,
  Uruguay: STRONG, Colombia: STRONG, Morocco: STRONG,
  // bons
  USA: GOOD, Mexico: GOOD, Switzerland: GOOD, Denmark: GOOD, Japan: GOOD, Senegal: GOOD,
  Serbia: GOOD, Ecuador: GOOD, 'South Korea': GOOD, 'Korea Republic': GOOD, Austria: GOOD,
  Ukraine: GOOD, Poland: GOOD, Sweden: GOOD, Wales: GOOD, Ghana: GOOD, 'Ivory Coast': GOOD,
  Nigeria: GOOD, Australia: GOOD, Canada: GOOD, Norway: GOOD, Turkey: GOOD, Egypt: GOOD,
  'Czech Republic': GOOD, Peru: GOOD, Chile: GOOD, Cameroon: GOOD, Tunisia: GOOD,
}

// Sempre retorna um valor (default p/ seleções não listadas), de modo que
// jogos de seleções fiquem sempre "previsíveis".
export function natStrength(name) {
  return BY_TEAM[name] || DEFAULT
}

// Versão estrita: só retorna força quando a seleção está na lista curada
// (ranking conhecido), senão null. Serve para distinguir um palpite com lastro
// real de um fallback genérico (ex.: amistoso entre seleções de base / pequenas
// sem ranking). Os bilhetes do dia usam isso para não recomendar jogos sem dado.
export function natStrengthKnown(name) {
  return BY_TEAM[name] || null
}
