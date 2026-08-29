import React from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  // BringToFront,
  // SendToBack,
  FileImage,
  FileText,
  Ban,
} from 'lucide-react'
import { CanvasElement, COLORS, FONT_SIZES, PEN_COLORS, TextAlign } from '../types'
import { effectiveFontSize, effectiveWeight } from './ElementView'

interface Props {
  x: number // screen coords of selection top-center
  y: number
  elements: CanvasElement[]
  onColor: (color: string) => void
  onBorder: (color: string) => void
  onFontSize: (size: number) => void
  onToggleBold: () => void
  onAlign: (a: TextAlign) => void
  // onFront: () => void
  // onBack: () => void
  onExportPng: () => void
  onExportPdf: () => void
}

const FILL_COLORABLE = new Set(['sticky', 'rect', 'ellipse', 'icon'])
const SHAPES = new Set(['rect', 'ellipse'])
const TEXTLIKE = new Set(['text', 'heading'])
const BOLDABLE = new Set(['text', 'heading', 'sticky', 'rect', 'ellipse'])

function SwatchRow({
  label,
  active,
  allowNone,
  noneTitle,
  onPick,
  swatchColor,
  keys = Object.keys(COLORS),
  names = (key: string) => COLORS[key].name,
}: {
  label: string | null
  active: string | undefined
  allowNone: boolean
  noneTitle: string
  onPick: (key: string) => void
  swatchColor: (key: string) => string
  keys?: string[]
  names?: (key: string) => string
}) {
  return (
    <div className="swatch-row">
      {label && <span className="swatch-label">{label}</span>}
      {keys.map((key) => (
        <button
          key={key}
          className={`swatch${active === key ? ' active' : ''}`}
          style={{ background: swatchColor(key) }}
          title={names(key)}
          onClick={() => onPick(key)}
        />
      ))}
      {allowNone && (
        <button
          className={`swatch swatch-none${active === 'none' || active === undefined ? ' active' : ''}`}
          title={noneTitle}
          onClick={() => onPick('none')}
        >
          <Ban size={13} />
        </button>
      )}
    </div>
  )
}

export function SelectionToolbar({
  x,
  y,
  elements,
  onColor,
  onBorder,
  onFontSize,
  onToggleBold,
  onAlign,
  // onFront,
  // onBack,
  onExportPng,
  onExportPdf,
}: Props) {
  const single = elements.length === 1 ? elements[0] : null
  const isFrame = single?.type === 'frame'
  const isText = !!single && TEXTLIKE.has(single.type)
  const showFill = !isText && elements.some((e) => FILL_COLORABLE.has(e.type))
  const allShapes = elements.length > 0 && elements.every((e) => SHAPES.has(e.type))
  const allDraw = elements.length > 0 && elements.every((e) => e.type === 'draw')
  const showBold = !!single && BOLDABLE.has(single.type)
  const activeColor = single?.color
  const activeBorder = single ? (single.border ?? 'none') : undefined
  const align = single?.align ?? 'left'

  const fontSize = single ? effectiveFontSize(single) : 16
  const sizeOptions = FONT_SIZES.includes(fontSize)
    ? FONT_SIZES
    : [...FONT_SIZES, fontSize].sort((a, b) => a - b)

  const rows = isText || showFill || allShapes || allDraw
  // buttons that sit after the swatch rows
  const tail = isFrame || (showBold && !isText)
  const halfWidth = isText ? 200 : rows ? (allShapes ? 210 : 175) : isFrame ? 140 : 70
  const left = Math.max(halfWidth + 12, Math.min(x, window.innerWidth - halfWidth - 12))
  const top = Math.max(isText || allShapes ? 100 : 64, y)

  // nothing to offer for this selection (e.g. a lone image) — skip the pill
  if (!rows && !tail) return null

  return (
    <div className="sel-toolbar" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="sel-rows">
        {isText && single && (
          <div className="swatch-row text-controls">
            <select
              className="font-size-select"
              title="Font size"
              value={fontSize}
              onChange={(e) => onFontSize(Number(e.target.value))}
            >
              {sizeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="divider" />
            <button
              className={`tool-btn${effectiveWeight(single) >= 700 ? ' active' : ''}`}
              title="Bold"
              onClick={onToggleBold}
            >
              <Bold size={14} />
            </button>
            <div className="divider" />
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight],
              ] as [TextAlign, typeof AlignLeft][]
            ).map(([a, Icon]) => (
              <button
                key={a}
                className={`tool-btn${align === a ? ' active' : ''}`}
                title={`Align ${a}`}
                onClick={() => onAlign(a)}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        )}
        {isText && (
          <div className="swatch-row">
            <span className="swatch-label" title="Font color">
              🎨
            </span>
            <button
              className={`swatch swatch-black${activeColor === 'black' ? ' active' : ''}`}
              title="Black"
              onClick={() => onColor('black')}
            />
            {Object.keys(COLORS).map((key) => (
              <button
                key={key}
                className={`swatch${activeColor === key ? ' active' : ''}`}
                style={{ background: COLORS[key].line }}
                title={COLORS[key].name}
                onClick={() => onColor(key)}
              />
            ))}
            <button
              className={`swatch swatch-none${activeColor === 'none' || activeColor === undefined ? ' active' : ''}`}
              title="Default"
              onClick={() => onColor('none')}
            >
              <Ban size={13} />
            </button>
          </div>
        )}
        {showFill && (
          <SwatchRow
            label={allShapes ? 'Fill' : null}
            active={activeColor}
            allowNone={allShapes}
            noneTitle="No fill"
            onPick={onColor}
            swatchColor={(k) => COLORS[k].fill}
          />
        )}
        {allDraw && (
          <SwatchRow
            label="Ink"
            active={activeColor ?? 'ink'}
            allowNone={false}
            noneTitle=""
            onPick={onColor}
            keys={Object.keys(PEN_COLORS)}
            names={(k) => PEN_COLORS[k].name}
            swatchColor={(k) => PEN_COLORS[k].stroke}
          />
        )}
        {allShapes && (
          <SwatchRow
            label="Line"
            active={activeBorder}
            allowNone
            noneTitle="No outline"
            onPick={onBorder}
            swatchColor={(k) => COLORS[k].line}
          />
        )}
      </div>
      {rows && tail && <div className="divider" />}
      {isFrame && (
        <>
          <button className="tool-btn wide" title="Export frame as PNG" onClick={onExportPng}>
            <FileImage size={15} />
            <span>PNG</span>
          </button>
          <button className="tool-btn wide" title="Export frame as PDF" onClick={onExportPdf}>
            <FileText size={15} />
            <span>PDF</span>
          </button>
        </>
      )}
      {showBold && !isText && (
        <button
          className={`tool-btn${single && effectiveWeight(single) >= 700 ? ' active' : ''}`}
          title="Bold"
          onClick={onToggleBold}
        >
          <Bold size={14} />
        </button>
      )}
      {/* z-order controls — shapes always sit behind, so these had little left
          to do. Duplicate (⌘D) and delete (⌫) live on the keyboard.
      {!isFrame && (
        <>
          <button className="tool-btn" title="Bring to front" onClick={onFront}>
            <BringToFront size={15} />
          </button>
          <button className="tool-btn" title="Send to back" onClick={onBack}>
            <SendToBack size={15} />
          </button>
        </>
      )}
      */}
    </div>
  )
}
