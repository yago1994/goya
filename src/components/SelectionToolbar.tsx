import React from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  FileImage,
  FileText,
  Minus,
  Plus,
  Trash2,
  Ban,
} from 'lucide-react'
import { CanvasElement, COLORS, TextAlign } from '../types'
import { effectiveFontSize, effectiveWeight } from './ElementView'

interface Props {
  x: number // screen coords of selection top-center
  y: number
  elements: CanvasElement[]
  onColor: (color: string) => void
  onBorder: (color: string) => void
  onFontStep: (dir: 1 | -1) => void
  onToggleBold: () => void
  onAlign: (a: TextAlign) => void
  onLevel: (level: number) => void
  onDuplicate: () => void
  onDelete: () => void
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
}: {
  label: string | null
  active: string | undefined
  allowNone: boolean
  noneTitle: string
  onPick: (key: string) => void
  swatchColor: (key: string) => string
}) {
  return (
    <div className="swatch-row">
      {label && <span className="swatch-label">{label}</span>}
      {Object.keys(COLORS).map((key) => (
        <button
          key={key}
          className={`swatch${active === key ? ' active' : ''}`}
          style={{ background: swatchColor(key) }}
          title={COLORS[key].name}
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
  onFontStep,
  onToggleBold,
  onAlign,
  onLevel,
  onDuplicate,
  onDelete,
  onExportPng,
  onExportPdf,
}: Props) {
  const single = elements.length === 1 ? elements[0] : null
  const isFrame = single?.type === 'frame'
  const isText = !!single && TEXTLIKE.has(single.type)
  const showFill = !isText && elements.some((e) => FILL_COLORABLE.has(e.type))
  const allShapes = elements.length > 0 && elements.every((e) => SHAPES.has(e.type))
  const showBold = !!single && BOLDABLE.has(single.type)
  const activeColor = single?.color
  const activeBorder = single ? (single.border ?? 'none') : undefined
  const align = single?.align ?? 'left'

  const rows = isText || showFill || allShapes
  const halfWidth = isText ? 220 : rows ? (allShapes ? 210 : 175) : isFrame ? 120 : 50
  const left = Math.max(halfWidth + 12, Math.min(x, window.innerWidth - halfWidth - 12))
  const top = Math.max(isText || allShapes ? 100 : 64, y)

  return (
    <div className="sel-toolbar" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="sel-rows">
        {isText && single && (
          <div className="swatch-row text-controls">
            <button className="tool-btn" title="Smaller" onClick={() => onFontStep(-1)}>
              <Minus size={14} />
            </button>
            <span className="font-size-label">{Math.round(effectiveFontSize(single))}</span>
            <button className="tool-btn" title="Larger" onClick={() => onFontStep(1)}>
              <Plus size={14} />
            </button>
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
            {single.type === 'heading' && (
              <>
                <div className="divider" />
                {[1, 2, 3, 4].map((lv) => (
                  <button
                    key={lv}
                    className={`tool-btn level-btn${(single.level ?? 1) === lv ? ' active' : ''}`}
                    title={`Heading ${lv}`}
                    onClick={() => onLevel(lv)}
                  >
                    H{lv}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {isText && (
          <SwatchRow
            label="Color"
            active={activeColor}
            allowNone
            noneTitle="Default"
            onPick={onColor}
            swatchColor={(k) => COLORS[k].line}
          />
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
      {rows && <div className="divider" />}
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
          <div className="divider" />
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
      <button className="tool-btn" title="Duplicate (⌘D)" onClick={onDuplicate}>
        <Copy size={15} />
      </button>
      <button className="tool-btn" title="Delete" onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
  )
}
