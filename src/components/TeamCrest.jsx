import { useState } from 'react'

export default function TeamCrest({ team }) {
  const [failed, setFailed] = useState(false)
  const showImg = team.badge && !failed
  return (
    <div className="crest" style={showImg ? undefined : { background: team.color }}>
      {showImg ? (
        <img src={team.badge} alt={team.name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        team.short
      )}
    </div>
  )
}
