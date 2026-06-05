import { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Sparkles } from 'lucide-react'
import { analyzeMatch } from '../lib/gemini.js'

const ADJ = {
  casa: 'favorece o mandante',
  fora: 'favorece o visitante',
  neutro: 'não muda o equilíbrio',
}

export default function AiPanel({ home, away, league }) {
  const [status, setStatus] = useState('idle') // idle | loading | done
  const [res, setRes] = useState(null)

  async function run() {
    setStatus('loading')
    const r = await analyzeMatch(home, away, league)
    if (r.needKey) {
      setRes({ ok: false, msg: 'Análise IA indisponível (chave do Gemini não configurada no servidor).' })
    } else {
      setRes(r)
    }
    setStatus('done')
  }

  if (status !== 'done') {
    return (
      <button className="aibtn" onClick={run} disabled={status === 'loading'}>
        {status === 'loading' ? (
          <>
            <span className="spin" /> Pesquisando notícias…
          </>
        ) : (
          <>
            <Brain size={16} /> Analisar notícias com IA
          </>
        )}
      </button>
    )
  }

  return (
    <motion.div
      className="aipanel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="ai-title">
        <Sparkles size={13} /> Análise IA · notícias recentes
      </div>
      {!res.ok ? (
        <div className="ai-resumo">Não consegui buscar a análise agora. {res.msg || ''}</div>
      ) : (
        <>
          <div className="ai-resumo">{res.data.resumo || ''}</div>
          <ul>{(res.data.fatores || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
          <div className="ai-adj">
            Leitura do contexto: <b>{ADJ[res.data.ajuste] || 'neutro'}</b> · confiança da notícia:{' '}
            <b>{res.data.confianca || 'média'}</b>. Lembrete: isto é contexto, não garantia — a probabilidade
            segue sendo a estatística do card.
          </div>
        </>
      )}
    </motion.div>
  )
}
