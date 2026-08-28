import React, { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { ImageResult, searchImages } from '../imageSearch'

interface Props {
  x: number
  y: number
  onSelect: (img: ImageResult) => void
  onClose: () => void
}

export function ImagePicker({ x, y, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ImageResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function run(q: string) {
    if (!q.trim()) return
    const id = ++seq.current
    setStatus('loading')
    try {
      const r = await searchImages(q.trim())
      if (id !== seq.current) return
      setResults(r)
      setStatus('done')
    } catch {
      if (id !== seq.current) return
      setResults([])
      setStatus('error')
    }
  }

  const width = 380
  const left = Math.min(x, window.innerWidth - width - 12)
  const top = Math.min(y, window.innerHeight - 460 - 12)

  return (
    <div className="picker" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="picker-input-row">
        <Search size={15} />
        <input
          ref={inputRef}
          className="picker-input"
          placeholder="Search the web for images…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter') run(query)
          }}
        />
        <kbd>↵</kbd>
      </div>
      {status === 'idle' && <div className="picker-status">Type a query and press Enter</div>}
      {status === 'loading' && <div className="picker-status">Searching…</div>}
      {status === 'error' && <div className="picker-status">Search failed — check your connection</div>}
      {status === 'done' && results.length === 0 && <div className="picker-status">No results</div>}
      {results.length > 0 && (
        <div className="image-scroll">
          <div className="image-grid">
            {results.map((img) => (
              <button key={img.id} className="image-cell" title={img.title} onClick={() => onSelect(img)}>
                <img src={img.thumb} alt={img.title} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
      {results.length > 0 && <div className="picker-footer">Openly licensed images via Openverse / Wikimedia Commons</div>}
    </div>
  )
}
