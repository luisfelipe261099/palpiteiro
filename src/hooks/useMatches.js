import { useState, useEffect, useCallback } from 'react'
import { loadAllLeagues } from '../lib/matches.js'
import { clearCache } from '../lib/api.js'

const CACHE_KEY = 'palpiteiro_groups'
const CACHE_TTL = 10 * 60 * 1000 // 10 min

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (c && Date.now() - c.ts < CACHE_TTL && Array.isArray(c.groups) && c.groups.length) return c.groups
  } catch {
    /* ignore */
  }
  return null
}
function writeCache(groups) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), groups }))
  } catch {
    /* ignore */
  }
}

export function useMatches() {
  // pinta instantâneo com o cache (se houver) e atualiza em background
  const [state, setState] = useState(() => {
    const cached = readCache()
    return { groups: cached || [], loading: !cached, error: null }
  })

  const load = useCallback(async ({ fresh = false, silent = false } = {}) => {
    if (fresh) {
      clearCache()
      try {
        localStorage.removeItem(CACHE_KEY)
      } catch {
        /* ignore */
      }
    }
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { groups, error } = await loadAllLeagues()
      if (!error) writeCache(groups)
      setState({ groups, loading: false, error })
    } catch {
      // mantém o que já estava na tela em caso de falha
      setState((s) => ({
        groups: s.groups,
        loading: false,
        error: s.groups.length ? null : 'Falha ao carregar dados ao vivo. Verifique sua conexão e tente novamente.',
      }))
    }
  }, [])

  useEffect(() => {
    const cached = readCache()
    load({ silent: !!cached }) // se tinha cache, atualiza sem mostrar o skeleton
  }, [load])

  return { ...state, reload: load }
}
