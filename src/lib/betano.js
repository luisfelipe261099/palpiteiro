export const BETANO_URL = 'https://www.betano.bet.br/sport'

export function openBetano() {
  const tab = window.open(BETANO_URL, '_blank', 'noopener,noreferrer')
  if (!tab) window.location.assign(BETANO_URL)
}
