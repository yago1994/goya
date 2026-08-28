import React from 'react'
import { Trash2, Type } from 'lucide-react'
import { ConnectorStyle } from '../types'

interface Props {
  x: number // screen coords, above connector midpoint
  y: number
  active: ConnectorStyle
  onStyle: (style: ConnectorStyle) => void
  onLabel: () => void
  onDelete: () => void
}

function StylePreview({ style }: { style: ConnectorStyle }) {
  const dash = style === 'dashed' ? '5 4' : style === 'dotted' ? '1.5 3.5' : undefined
  return (
    <svg width="22" height="10" viewBox="0 0 22 10">
      <path
        d="M 1 5 H 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray={dash}
        fill="none"
      />
    </svg>
  )
}

export function ConnectorToolbar({ x, y, active, onStyle, onLabel, onDelete }: Props) {
  const left = Math.max(110, Math.min(x, window.innerWidth - 110))
  const top = Math.max(64, y)
  return (
    <div className="sel-toolbar" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {(['solid', 'dashed', 'dotted'] as ConnectorStyle[]).map((s) => (
        <button
          key={s}
          className={`tool-btn${active === s ? ' active' : ''}`}
          title={s[0].toUpperCase() + s.slice(1)}
          onClick={() => onStyle(s)}
        >
          <StylePreview style={s} />
        </button>
      ))}
      <div className="divider" />
      <button className="tool-btn" title="Add label" onClick={onLabel}>
        <Type size={15} />
      </button>
      <button className="tool-btn" title="Delete" onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
  )
}
