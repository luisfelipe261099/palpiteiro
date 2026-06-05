import { useState, useEffect, useCallback } from 'react'
import { loadAllLeagues } from '../lib/matches.js'
import { clearCache } from '../lib/api.js'

export function useMatches() {
  const [state, setState] = useState({ groups: [], loading: true, error: null })

  const load = useCallback(async ({ fresh = false } = {}) => {
    if (fresh) clearCache()
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { groups, error } = await loadAllLeagues()
      setState({ groups, loading: false, error })
    } catch {
      setState({
        groups: [],
        loading: false,
        error: 'Falha ao carregar dados ao vivo. Verifique sua conexão e tente novamente.',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}
