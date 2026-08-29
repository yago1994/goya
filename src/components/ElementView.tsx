import React, { useEffect, useRef } from 'react'
import { icons } from 'lucide-react'
import { CanvasElement, COLORS, EDITABLE_TYPES, HEADING_SIZES, Side } from '../types'

export type ResizeDir = 'e' | 'w' | 'n' | 's' | 'se'

interface Props {
  el: CanvasElement
  selected: boolean
  editing: boolean
  connectTarget: boolean
  zoom: number
  onPointerDown: (e: React.PointerEvent, el: CanvasElement) => void
  onDoubleClick: (e: React.MouseEvent, el: CanvasElement) => void
  onTextChange: (el: CanvasElement, text: string, height: number) => void
  onEditEnd: (el: CanvasElement, text: string) => void
  onResizeStart: (e: React.PointerEvent, el: CanvasElement, dir: ResizeDir) => void
  onPortDown: (e: React.PointerEvent, el: CanvasElement, side: Side) => void
}

const PORT_SIDES: Side[] = ['top', 'right', 'bottom', 'left']

const portPos: Record<Side, React.CSSProperties> = {
  top: { top: 0, left: '50%' },
  right: { top: '50%', left: '100%' },
  bottom: { top: '100%', left: '50%' },
  left: { top: '50%', left: 0 },
}

/** Edge/corner resize handles shown while selected. */
function ResizeHandles({
  el,
  onResizeStart,
}: {
  el: CanvasElement
  onResizeStart: (e: React.PointerEvent, el: CanvasElement, dir: ResizeDir) => void
}) {
  // text auto-manages its height, so only width is draggable there
  const dirs: ResizeDir[] =
    el.type === 'text' || el.type === 'heading' ? ['e', 'w', 'se'] : ['e', 'w', 'n', 's', 'se']
  return (
    <>
      {dirs.map((dir) => (
        <div
          key={dir}
          className={`resize-edge resize-${dir}`}
          style={{ pointerEvents: 'auto' }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onResizeStart(e, el, dir)
          }}
        />
      ))}
    </>
  )
}

export function defaultFontSize(el: CanvasElement): number {
  if (el.type === 'heading') return (HEADING_SIZES[el.level ?? 1] ?? HEADING_SIZES[1]).size
  return 16
}

export function effectiveFontSize(el: CanvasElement): number {
  return el.fontSize ?? defaultFontSize(el)
}

function defaultWeight(el: CanvasElement): number {
  if (el.type === 'heading') return (HEADING_SIZES[el.level ?? 1] ?? HEADING_SIZES[1]).weight
  if (el.type === 'text') return 400
  return 500 // sticky, shapes
}

export function effectiveWeight(el: CanvasElement): number {
  if (el.bold === undefined) return defaultWeight(el)
  return el.bold ? 700 : 400
}

export const ElementView = React.memo(function ElementView({
  el,
  selected,
  editing,
  connectTarget,
  zoom,
  onPointerDown,
  onDoubleClick,
  onTextChange,
  onEditEnd,
  onResizeStart,
  onPortDown,
}: Props) {
  const textRef = useRef<HTMLDivElement>(null)

  // Text content is set via ref (not React children) so typing doesn't fight
  // the virtual DOM. Sync from state when not editing (undo/redo);
  // focus and place caret at end when editing starts.
  useEffect(() => {
    const node = textRef.current
    if (!node) return
    if (!editing && node.innerText !== (el.text ?? '')) node.innerText = el.text ?? ''
  }, [el.text, editing])

  useEffect(() => {
    const node = textRef.current
    if (!node) return
    if (node.innerText !== (el.text ?? '')) node.innerText = el.text ?? ''
    if (editing) {
      node.focus()
      const range = document.createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, el.id])

  const color = COLORS[el.color ?? 'yellow'] ?? COLORS.yellow

  const style: React.CSSProperties = {
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
  }

  let content: React.ReactNode = null
  const editable = EDITABLE_TYPES.includes(el.type) || el.type === 'frame'

  const textBox = editable ? (
    <div
      ref={textRef}
      className={`text-box${editing ? ' editing' : ''}`}
      contentEditable={editing}
      suppressContentEditableWarning
      data-placeholder={
        el.type === 'heading'
          ? 'Heading'
          : el.type === 'text'
            ? 'Type something…'
            : el.type === 'frame'
              ? 'Frame'
              : ''
      }
      onInput={(e) => {
        const node = e.currentTarget
        onTextChange(el, node.innerText, node.scrollHeight)
      }}
      onBlur={(e) => editing && onEditEnd(el, e.currentTarget.innerText)}
      onPointerDown={(e) => {
        if (editing) e.stopPropagation()
      }}
      onKeyDown={(e) => {
        if (!editing) return
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.currentTarget.blur()
        }
      }}
    />
  ) : null

  switch (el.type) {
    case 'sticky':
      content = (
        <div
          className="content"
          style={{ background: color.fill, color: color.text, fontWeight: effectiveWeight(el) }}
        >
          {textBox}
        </div>
      )
      break
    case 'text':
    case 'heading': {
      const fontColor =
        el.color === 'black'
          ? '#0f0f0f'
          : el.color && el.color !== 'none' && COLORS[el.color]
            ? COLORS[el.color].line
            : undefined
      content = (
        <div
          className="content"
          style={{
            fontSize: effectiveFontSize(el),
            fontWeight: effectiveWeight(el),
            color: fontColor,
            textAlign: el.align ?? 'left',
          }}
        >
          {textBox}
        </div>
      )
      break
    }
    case 'rect':
    case 'ellipse': {
      const fillKey = el.color ?? 'blue'
      const fill = fillKey === 'none' ? 'transparent' : (COLORS[fillKey]?.fill ?? 'transparent')
      const textColor = fillKey === 'none' ? 'var(--ink)' : (COLORS[fillKey]?.text ?? 'var(--ink)')
      const borderKey = el.border ?? 'none'
      const borderCss =
        borderKey === 'none'
          ? fillKey === 'none'
            ? '1.5px dashed rgba(55, 53, 47, 0.25)' // keep an invisible-fill shape findable
            : 'none'
          : `2px solid ${COLORS[borderKey]?.line ?? '#96948F'}`
      content = (
        <div
          className="content"
          style={{ background: fill, color: textColor, border: borderCss, fontWeight: effectiveWeight(el) }}
        >
          {textBox}
        </div>
      )
      break
    }
    case 'icon': {
      const Icon = (icons as Record<string, any>)[el.icon ?? 'Star'] ?? icons.Star
      content = (
        <div className="content">
          <Icon
            width="100%"
            height="100%"
            strokeWidth={1.6}
            style={{ color: color.text }}
            absoluteStrokeWidth={false}
          />
        </div>
      )
      break
    }
    case 'emoji':
      content = (
        <div className="content emoji-content" style={{ fontSize: Math.min(el.w, el.h) * 0.8 }}>
          {el.text}
        </div>
      )
      break
    case 'image':
      content = (
        <div className="content">
          <img src={el.url} alt={el.text ?? ''} draggable={false} />
        </div>
      )
      break
    case 'frame':
      // The frame body ignores pointer events so you can work inside it;
      // select and drag it by its title tab.
      return (
        <div
          className={`el el-frame${selected ? ' selected' : ''}`}
          style={{ ...style, pointerEvents: 'none' }}
          data-element-id={el.id}
        >
          <div
            className="frame-title"
            onPointerDown={(e) => onPointerDown(e, el)}
            onDoubleClick={(e) => onDoubleClick(e, el)}
          >
            {textBox}
          </div>
          <div className="content frame-body" />
          {selected && <ResizeHandles el={el} onResizeStart={onResizeStart} />}
        </div>
      )
  }

  return (
    <div
      className={`el el-${el.type}${selected ? ' selected' : ''}${connectTarget ? ' connect-target' : ''}`}
      style={style}
      data-element-id={el.id}
      onPointerDown={(e) => onPointerDown(e, el)}
      onDoubleClick={(e) => onDoubleClick(e, el)}
    >
      {content}
      {PORT_SIDES.map((side) => (
        <div
          key={side}
          className="port"
          style={portPos[side]}
          onPointerDown={(e) => {
            e.stopPropagation()
            onPortDown(e, el, side)
          }}
        />
      ))}
      {selected && <ResizeHandles el={el} onResizeStart={onResizeStart} />}
    </div>
  )
})
