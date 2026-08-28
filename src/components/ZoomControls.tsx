import React from 'react'
import { Minus, Plus, Maximize } from 'lucide-react'

interface Props {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFit: () => void
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, onFit }: Props) {
  return (
    <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={onZoomOut} title="Zoom out">
        <Minus size={15} />
      </button>
      <div className="zoom-label" onClick={onReset} title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </div>
      <button onClick={onZoomIn} title="Zoom in">
        <Plus size={15} />
      </button>
      <button onClick={onFit} title="Fit content">
        <Maximize size={14} />
      </button>
    </div>
  )
}
