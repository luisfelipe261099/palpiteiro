import { motion } from 'framer-motion'
import { pct } from '../lib/poisson.js'

export default function ProbBar({ label, p, color, best }) {
  const value = pct(p)
  return (
    <div className={`prow ${best ? 'best' : ''}`}>
      <span className="plabel">{label}</span>
      <div className="ptrack">
        <motion.div
          className="pfill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <span className="pval">{value}%</span>
    </div>
  )
}
