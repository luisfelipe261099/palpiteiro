import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const BetSlipContext = createContext(null)
const STORAGE = 'palpiteiro_bilhete'

function loadInitial() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || '[]')
  } catch {
    return []
  }
}

export function BetSlipProvider({ children }) {
  const [picks, setPicks] = useState(loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(picks))
    } catch {
      /* ignore */
    }
  }, [picks])

  const toggle = useCallback((pick) => {
    setPicks((prev) => {
      const i = prev.findIndex((p) => p.id === pick.id)
      if (i >= 0) return prev.filter((p) => p.id !== pick.id)
      return [...prev, pick]
    })
  }, [])

  const remove = useCallback((id) => setPicks((prev) => prev.filter((p) => p.id !== id)), [])
  const clear = useCallback(() => setPicks([]), [])
  const replace = useCallback((nextPicks) => setPicks(nextPicks), [])
  const has = useCallback((id) => picks.some((p) => p.id === id), [picks])

  const totals = useMemo(() => {
    let odd = 1
    let prob = 1
    picks.forEach((p) => {
      odd *= p.odd
      prob *= p.p
    })
    return {
      count: picks.length,
      odd,
      prob,
      payout: 10 * odd,
    }
  }, [picks])

  const value = useMemo(
    () => ({ picks, toggle, remove, clear, replace, has, totals }),
    [picks, toggle, remove, clear, replace, has, totals],
  )

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext)
  if (!ctx) throw new Error('useBetSlip must be used within BetSlipProvider')
  return ctx
}
