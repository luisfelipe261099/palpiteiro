export default function FormPills({ form }) {
  if (!form || !form.length) return <div className="form"><span className="nf">sem histórico</span></div>
  return (
    <div className="form">
      {form.map((f, i) => (
        <span key={i} className={`f-${f}`}>
          {f}
        </span>
      ))}
    </div>
  )
}
