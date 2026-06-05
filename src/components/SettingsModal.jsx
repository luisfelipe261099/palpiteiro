import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain } from 'lucide-react'
import { getGeminiKey, setGeminiKey } from '../lib/gemini.js'

export default function SettingsModal({ open, onClose }) {
  const [key, setKey] = useState('')

  useEffect(() => {
    if (open) setKey(getGeminiKey())
  }, [open])

  if (!open) return null

  function save() {
    setGeminiKey(key.trim())
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h3>
          <Brain size={18} /> Análise IA (opcional)
        </h3>
        <p>
          A análise de notícias usa o <b>Google Gemini</b> com busca na web. Crie uma chave grátis em{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            aistudio.google.com/apikey
          </a>{' '}
          e cole abaixo. Ela fica salva só no seu navegador.
        </p>
        <label htmlFor="cfgkey">Chave da API Gemini</label>
        <input
          id="cfgkey"
          type="password"
          placeholder="AIza..."
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <div className="hint">Deixe em branco para usar a chave padrão do projeto (.env).</div>
        <div className="modal-actions">
          <button className="cancel" onClick={onClose}>
            Cancelar
          </button>
          <button className="save" onClick={save}>
            Salvar
          </button>
        </div>
      </motion.div>
    </div>
  )
}
