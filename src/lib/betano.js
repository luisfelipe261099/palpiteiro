export const BETANO_URL = 'https://www.betano.bet.br/sport'

export function openBetano() {
  const tab = window.open(BETANO_URL, '_blank', 'noopener,noreferrer')
  if (!tab) window.location.assign(BETANO_URL)
}

// Copia o código de aposta (booking code) para a área de transferência e abre a
// Betano, onde o usuário cola em "Insert Booking Code here" para carregar o
// bilhete inteiro de uma vez. Retorna true se conseguiu copiar.
export async function openBetanoWithCode(code) {
  let copied = false
  try {
    await navigator.clipboard.writeText(code)
    copied = true
  } catch {
    /* clipboard pode falhar (permissão/contexto); o código fica visível no card */
  }
  openBetano()
  return copied
}
