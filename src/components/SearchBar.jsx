import { Search, X } from 'lucide-react'

export default function SearchBar({ value, onChange }) {
  return (
    <div className="search">
      <Search size={16} className="search-ico" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar time, jogo ou liga…"
        aria-label="Buscar"
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Limpar busca">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
