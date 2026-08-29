import { Brush, Check, Eraser, Highlighter, Pen } from 'lucide-react'
import { DrawSettings, PEN_COLORS, PEN_SIZES, PEN_STYLES, PenTool } from '../types'

interface Props {
  settings: DrawSettings
  onChange: (patch: Partial<DrawSettings>) => void
  onDone: () => void
}

const TOOLS: { pen: PenTool; icon: typeof Pen; key: string }[] = [
  { pen: 'pen', icon: Pen, key: 'P' },
  { pen: 'marker', icon: Brush, key: 'M' },
  { pen: 'highlighter', icon: Highlighter, key: 'H' },
]

/** visual diameter of each size button's dot */
const SIZE_DOTS = [5, 8, 12]

export function DrawToolbar({ settings, onChange, onDone }: Props) {
  return (
    <div className="draw-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="draw-group">
        {TOOLS.map(({ pen, icon: Icon, key }) => (
          <button
            key={pen}
            className={`tool-btn${!settings.eraser && settings.pen === pen ? ' active' : ''}`}
            title={`${PEN_STYLES[pen].name} (${key})`}
            onClick={() => onChange({ pen, eraser: false })}
          >
            <Icon size={16} />
          </button>
        ))}
        <button
          className={`tool-btn${settings.eraser ? ' active' : ''}`}
          title="Eraser (E) — drag across a stroke to remove it"
          onClick={() => onChange({ eraser: !settings.eraser })}
        >
          <Eraser size={16} />
        </button>
      </div>

      <div className="divider" />

      <div className="draw-group">
        {PEN_SIZES.map((size, i) => (
          <button
            key={size}
            className={`tool-btn${!settings.eraser && settings.size === size ? ' active' : ''}`}
            title={`Stroke ${['thin', 'medium', 'thick'][i]} ([ / ])`}
            onClick={() => onChange({ size, eraser: false })}
          >
            <span
              className="size-dot"
              style={{ width: SIZE_DOTS[i], height: SIZE_DOTS[i] }}
            />
          </button>
        ))}
      </div>

      <div className="divider" />

      <div className="draw-group">
        {Object.entries(PEN_COLORS).map(([key, c]) => (
          <button
            key={key}
            className={`pen-swatch${!settings.eraser && settings.color === key ? ' active' : ''}`}
            style={{ background: c.stroke }}
            title={c.name}
            onClick={() => onChange({ color: key, eraser: false })}
          />
        ))}
      </div>

      <div className="divider" />

      <button className="draw-done" onClick={onDone} title="Leave drawing mode">
        <Check size={15} />
        Done
        <kbd>esc</kbd>
      </button>
    </div>
  )
}
