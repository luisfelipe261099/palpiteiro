import MatchCard from './MatchCard.jsx'

export default function LeagueGroup({ group, startIndex }) {
  return (
    <section>
      <div className="league-head">
        <span className="flag">{group.flag}</span>
        <h2>{group.name}</h2>
        <span className="line" />
        <span className="count">{group.matches.length} jogos</span>
      </div>
      {group.matches.map((m, i) => (
        <MatchCard key={m.id} match={m} index={startIndex + i} />
      ))}
    </section>
  )
}
