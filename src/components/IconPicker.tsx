import React, { useEffect, useMemo, useRef, useState } from 'react'
import { icons, Search } from 'lucide-react'

const ALL_NAMES = Object.keys(icons)

// Shown before the user types anything
const FEATURED = [
  'Lightbulb', 'Star', 'Heart', 'Rocket', 'Target', 'Flag', 'Zap', 'Flame',
  'CircleCheck', 'CircleX', 'CircleAlert', 'CircleHelp', 'ThumbsUp', 'ThumbsDown', 'Smile', 'Frown',
  'User', 'Users', 'MessageCircle', 'Mail', 'Phone', 'Calendar', 'Clock', 'MapPin',
  'Home', 'Building', 'Briefcase', 'GraduationCap', 'Stethoscope', 'Microscope', 'FlaskConical', 'Dna',
  'Brain', 'Eye', 'Puzzle', 'Key', 'Lock', 'Shield', 'Trophy', 'Gift',
  'DollarSign', 'TrendingUp', 'ChartBar', 'ChartPie', 'Database', 'Server', 'Cloud', 'Wifi',
  'Laptop', 'Smartphone', 'Camera', 'Music', 'Palette', 'Pencil', 'Scissors', 'Wrench',
  'Leaf', 'TreePine', 'Sun', 'Moon', 'CloudRain', 'Globe', 'Plane', 'Car',
].filter((n) => n in icons)

interface Props {
  x: number
  y: number
  onSelect: (name: string) => void
  onClose: () => void
}

export function IconPicker({ x, y, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const names = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[\s_-]+/g, '')
    if (!q) return FEATURED
    return ALL_NAMES.filter((n) => n.toLowerCase().includes(q)).slice(0, 96)
  }, [query])

  const width = 380
  const left = Math.min(x, window.innerWidth - width - 12)
  const top = Math.min(y, window.innerHeight - 380 - 12)

  return (
    <div className="picker" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="picker-input-row">
        <Search size={15} />
        <input
          ref={inputRef}
          className="picker-input"
          placeholder="Search icons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && names.length > 0) onSelect(names[0])
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="icon-grid">
        {names.map((name) => {
          const Icon = (icons as Record<string, any>)[name]
          return (
            <button key={name} className="icon-cell" title={name} onClick={() => onSelect(name)}>
              <Icon size={20} strokeWidth={1.7} />
            </button>
          )
        })}
      </div>
      {names.length === 0 && <div className="picker-status">No icons found</div>}
    </div>
  )
}
