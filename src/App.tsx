import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  addConnector,
  addElement,
  removeConnector,
  removeElements,
  updateConnector,
  updateElement,
  updateElements,
  useDoc,
} from './state'
import {
  CanvasElement,
  Connector,
  ConnectorStyle,
  DEFAULT_DRAW,
  COLORS,
  DEFAULTS,
  DocState,
  DrawSettings,
  EDITABLE_TYPES,
  ElementType,
  FONT_SIZES,
  HEADING_SIZES,
  PEN_COLORS,
  PEN_SIZES,
  PEN_STYLES,
  Side,
  TextAlign,
  Viewport,
  newId,
} from './types'
import { connectorGeometry, nearestSide } from './geometry'
import { strokeElement, strokeNear, strokePath } from './drawing'
import { fileToDataUrl } from './imageUpload'
import { exportBoardFile, exportFramePdf, exportFramePng, parseBoardFile } from './exporting'
import { ElementView, effectiveFontSize, effectiveWeight } from './components/ElementView'
import { BoardsPanel } from './components/BoardsPanel'
import { ConnectorLayer, TempConnector } from './components/ConnectorLayer'
import { SlashAction, SlashMenu } from './components/SlashMenu'
import { IconPicker } from './components/IconPicker'
import { EmojiPicker } from './components/EmojiPicker'
import { ImagePicker } from './components/ImagePicker'
import { SelectionToolbar } from './components/SelectionToolbar'
import { ConnectorToolbar } from './components/ConnectorToolbar'
import { DrawToolbar } from './components/DrawToolbar'
import { ZoomControls } from './components/ZoomControls'

const MIN_ZOOM = 0.12
const MAX_ZOOM = 4
/** eraser reach in screen px, so it stays a constant size on screen at any zoom */
const ERASER_RADIUS = 11

type Gesture =
  | { mode: 'pan'; startX: number; startY: number; vp: Viewport }
  | {
      mode: 'drag'
      startWorld: { x: number; y: number }
      origins: Map<string, { x: number; y: number }>
      base: DocState
      moved: boolean
    }
  | { mode: 'resize'; id: string; startWorld: { x: number; y: number }; w: number; h: number; base: DocState }
  | { mode: 'marquee'; startWorld: { x: number; y: number } }
  | { mode: 'connect'; fromId: string; fromSide: Side; base: DocState }
  | { mode: 'reconnect'; connectorId: string; end: 'from' | 'to'; base: DocState }
  /** freehand: `points` is a flat trail of world coordinates */
  | { mode: 'draw'; points: number[] }
  | { mode: 'erase'; base: DocState; erased: Set<string> }

interface Popup {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}

interface Clipboard {
  elements: CanvasElement[]
  connectors: Connector[]
}

const EDITABLE_OR_FRAME = (type: ElementType) => EDITABLE_TYPES.includes(type) || type === 'frame'

function frameContains(frame: CanvasElement, el: CanvasElement): boolean {
  const cx = el.x + el.w / 2
  const cy = el.y + el.h / 2
  return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h
}

export default function App() {
  const {
    doc,
    docRef,
    set,
    commit,
    pushHistory,
    undo,
    redo,
    boards,
    activeBoard,
    switchBoard,
    createBoard,
    renameBoard,
    deleteBoard,
  } = useDoc()
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingConnLabel, setEditingConnLabel] = useState<string | null>(null)
  const [slash, setSlash] = useState<Popup | null>(null)
  const [picker, setPicker] = useState<(Popup & { kind: 'icon' | 'emoji' | 'image' }) | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawSettings, setDrawSettings] = useState<DrawSettings>(DEFAULT_DRAW)
  const [liveStroke, setLiveStroke] = useState<number[] | null>(null)
  const [tempConn, setTempConn] = useState<TempConnector | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [boardsOpen, setBoardsOpen] = useState(false)
  const [, bumpGestureTick] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadPoint = useRef<{ x: number; y: number } | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const mouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const vpRef = useRef(vp)
  vpRef.current = vp
  const editBase = useRef<DocState | null>(null)
  const clipboard = useRef<Clipboard | null>(null)
  // manual double-click detection: pointer capture on the root retargets
  // native click/dblclick events away from elements, so we can't rely on them
  const lastClick = useRef<{ id: string; time: number; x: number; y: number } | null>(null)

  const toWorld = (sx: number, sy: number) => ({
    x: (sx - vpRef.current.x) / vpRef.current.zoom,
    y: (sy - vpRef.current.y) / vpRef.current.zoom,
  })
  const toScreen = (wx: number, wy: number) => ({
    x: wx * vpRef.current.zoom + vpRef.current.x,
    y: wy * vpRef.current.zoom + vpRef.current.y,
  })

  /* ---------- creation ---------- */

  function createElement(type: ElementType, worldX: number, worldY: number, extra?: Partial<CanvasElement>) {
    const d = DEFAULTS[type]
    const w = extra?.w ?? d.w
    const h = extra?.h ?? d.h
    const el: CanvasElement = {
      id: newId(),
      type,
      text: '',
      color:
        type === 'sticky'
          ? 'yellow'
          : type === 'icon'
            ? 'gray'
            : type === 'rect' || type === 'ellipse'
              ? 'blue'
              : undefined,
      border: type === 'rect' || type === 'ellipse' ? 'blue' : undefined,
      ...extra,
      x: worldX - w / 2,
      y: worldY - h / 2,
      w,
      h,
    }
    commit((doc) => addElement(doc, el))
    setSelection(new Set([el.id]))
    setSelectedConnector(null)
    if (EDITABLE_OR_FRAME(type)) {
      editBase.current = docRef.current
      setEditingId(el.id)
    }
    return el
  }

  function insertImageFiles(files: File[], at: { x: number; y: number }) {
    files
      .filter((f) => f.type.startsWith('image/'))
      .forEach((file, i) => {
        fileToDataUrl(file)
          .then(({ url, width, height }) => {
            const w = Math.min(360, width)
            const h = Math.max(40, w * (height / Math.max(1, width)))
            const el: CanvasElement = {
              id: newId(),
              type: 'image',
              x: at.x - w / 2 + i * 28,
              y: at.y - h / 2 + i * 28,
              w,
              h,
              url,
              text: file.name,
            }
            commit((doc) => addElement(doc, el))
            setSelection(new Set([el.id]))
          })
          .catch(() => {
            // unreadable file — skip
          })
      })
  }

  /* ---------- freehand drawing ---------- */

  function enterDrawMode(patch?: Partial<DrawSettings>) {
    setDrawSettings((s) => ({ ...s, eraser: false, ...patch }))
    setDrawing(true)
    setSelection(new Set())
    setSelectedConnector(null)
    setEditingId(null)
  }

  /** Remove every drawing the eraser is touching; one undo step per sweep. */
  function eraseAt(p: { x: number; y: number }) {
    const g = gesture.current
    if (!g || g.mode !== 'erase') return
    const radius = ERASER_RADIUS / vpRef.current.zoom
    const hits = docRef.current.elements
      .filter((el) => el.type === 'draw' && strokeNear(el, p, radius))
      .map((el) => el.id)
    if (hits.length === 0) return
    hits.forEach((id) => g.erased.add(id))
    set((d) => removeElements(d, new Set(hits)))
  }

  function handleSlashAction(action: SlashAction) {
    if (!slash) return
    const { worldX, worldY, screenX, screenY } = slash
    setSlash(null)
    // anything placed on the canvas leaves drawing mode, so it can be edited
    if (action.kind !== 'draw') setDrawing(false)
    if (action.kind === 'draw') {
      enterDrawMode({ pen: action.pen })
    } else if (action.kind === 'create') {
      createElement(action.type, worldX, worldY, action.extra)
    } else if (action.kind === 'icon-picker') {
      setPicker({ kind: 'icon', screenX, screenY, worldX, worldY })
    } else if (action.kind === 'emoji-picker') {
      setPicker({ kind: 'emoji', screenX, screenY, worldX, worldY })
    } else if (action.kind === 'image-picker') {
      setPicker({ kind: 'image', screenX, screenY, worldX, worldY })
    } else if (action.kind === 'upload-image') {
      uploadPoint.current = { x: worldX, y: worldY }
      fileInputRef.current?.click()
    }
  }

  /* ---------- editing ---------- */

  function startEditing(el: CanvasElement) {
    editBase.current = docRef.current
    setEditingId(el.id)
    setSelection(new Set([el.id]))
  }

  function handleTextChange(el: CanvasElement, text: string, contentHeight: number) {
    set((d) =>
      updateElement(d, el.id, {
        text,
        ...(el.type === 'text' || el.type === 'heading'
          ? { h: Math.max(el.type === 'text' ? DEFAULTS.text.h : 30, contentHeight + 10) }
          : {}),
      })
    )
  }

  function handleEditEnd(el: CanvasElement, text: string) {
    // an abandoned empty text/heading disappears instead of littering the canvas
    if ((el.type === 'text' || el.type === 'heading') && text.trim() === '') {
      set((d) => removeElements(d, new Set([el.id])))
      setSelection((s) => {
        const next = new Set(s)
        next.delete(el.id)
        return next
      })
    } else {
      set((d) => updateElement(d, el.id, { text }))
    }
    setEditingId(null)
    if (editBase.current) {
      pushHistory(editBase.current)
      editBase.current = null
    }
  }

  /* ---------- pointer interactions ---------- */

  function handleElementPointerDown(e: React.PointerEvent, el: CanvasElement) {
    if (e.button !== 0 || spaceDown) return // let root handle panning
    e.stopPropagation()
    if (editingId === el.id) return

    const prev = lastClick.current
    lastClick.current = { id: el.id, time: e.timeStamp, x: e.clientX, y: e.clientY }
    if (
      prev &&
      prev.id === el.id &&
      e.timeStamp - prev.time < 450 &&
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 6 &&
      EDITABLE_OR_FRAME(el.type)
    ) {
      startEditing(el)
      return
    }

    rootRef.current?.setPointerCapture(e.pointerId)

    let sel = selection
    if (e.shiftKey) {
      sel = new Set(selection)
      if (sel.has(el.id)) sel.delete(el.id)
      else sel.add(el.id)
    } else if (!selection.has(el.id)) {
      sel = new Set([el.id])
    }
    setSelection(sel)
    setSelectedConnector(null)

    // dragging a frame carries everything inside it along
    const dragIds = new Set(sel)
    for (const f of docRef.current.elements) {
      if (f.type !== 'frame' || !sel.has(f.id)) continue
      for (const other of docRef.current.elements) {
        if (other.id !== f.id && other.type !== 'frame' && frameContains(f, other)) dragIds.add(other.id)
      }
    }
    const origins = new Map<string, { x: number; y: number }>()
    for (const other of docRef.current.elements) {
      if (dragIds.has(other.id)) origins.set(other.id, { x: other.x, y: other.y })
    }
    gesture.current = {
      mode: 'drag',
      startWorld: toWorld(e.clientX, e.clientY),
      origins,
      base: docRef.current,
      moved: false,
    }
  }

  function handleElementDoubleClick(e: React.MouseEvent, el: CanvasElement) {
    e.stopPropagation()
    if (EDITABLE_OR_FRAME(el.type)) startEditing(el)
  }

  function handleResizeStart(e: React.PointerEvent, el: CanvasElement) {
    if (e.button !== 0) return
    rootRef.current?.setPointerCapture(e.pointerId)
    gesture.current = {
      mode: 'resize',
      id: el.id,
      startWorld: toWorld(e.clientX, e.clientY),
      w: el.w,
      h: el.h,
      base: docRef.current,
    }
  }

  function handlePortDown(e: React.PointerEvent, el: CanvasElement, side: Side) {
    if (e.button !== 0) return
    rootRef.current?.setPointerCapture(e.pointerId)
    gesture.current = { mode: 'connect', fromId: el.id, fromSide: side, base: docRef.current }
    setTempConn({
      fixedId: el.id,
      fixedSide: side,
      freeWorld: toWorld(e.clientX, e.clientY),
      targetId: null,
      freeIsTo: true,
    })
  }

  function handleEndpointDown(e: React.PointerEvent, connectorId: string, end: 'from' | 'to') {
    if (e.button !== 0) return
    const conn = docRef.current.connectors.find((c) => c.id === connectorId)
    if (!conn) return
    rootRef.current?.setPointerCapture(e.pointerId)
    gesture.current = { mode: 'reconnect', connectorId, end, base: docRef.current }
    setTempConn({
      fixedId: end === 'from' ? conn.to : conn.from,
      fixedSide: end === 'from' ? conn.toSide : conn.fromSide,
      freeWorld: toWorld(e.clientX, e.clientY),
      targetId: end === 'from' ? conn.from : conn.to,
      reconnectingId: connectorId,
      freeIsTo: end === 'to',
    })
  }

  function elementUnderPointer(e: React.PointerEvent): string | null {
    const under = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('[data-element-id]') as HTMLElement | null
    return under?.dataset.elementId ?? null
  }

  function handleRootPointerDown(e: React.PointerEvent) {
    setSlash(null)
    setPicker(null)
    setBoardsOpen(false)
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      rootRef.current?.setPointerCapture(e.pointerId)
      gesture.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, vp: vpRef.current }
      setIsPanning(true)
      return
    }
    if (e.button !== 0) return
    rootRef.current?.setPointerCapture(e.pointerId)
    setSelection(new Set())
    setSelectedConnector(null)
    if (drawing) {
      const w = toWorld(e.clientX, e.clientY)
      if (drawSettings.eraser) {
        gesture.current = { mode: 'erase', base: docRef.current, erased: new Set() }
        eraseAt(w)
      } else {
        gesture.current = { mode: 'draw', points: [w.x, w.y] }
        setLiveStroke([w.x, w.y])
      }
      return
    }
    // empty canvas: start marquee selection
    gesture.current = { mode: 'marquee', startWorld: toWorld(e.clientX, e.clientY) }
  }

  function handleRootPointerMove(e: React.PointerEvent) {
    mouse.current = { x: e.clientX, y: e.clientY }
    const g = gesture.current
    if (!g) return
    if (g.mode === 'pan') {
      setVp({ ...g.vp, x: g.vp.x + (e.clientX - g.startX), y: g.vp.y + (e.clientY - g.startY) })
    } else if (g.mode === 'drag') {
      const w = toWorld(e.clientX, e.clientY)
      const dx = w.x - g.startWorld.x
      const dy = w.y - g.startWorld.y
      if (!g.moved && Math.hypot(dx * vpRef.current.zoom, dy * vpRef.current.zoom) < 4) return
      g.moved = true
      set((d) =>
        updateElements(d, new Set(g.origins.keys()), (el) => {
          const o = g.origins.get(el.id)!
          return { ...el, x: o.x + dx, y: o.y + dy }
        })
      )
    } else if (g.mode === 'resize') {
      const w = toWorld(e.clientX, e.clientY)
      const dw = w.x - g.startWorld.x
      const dh = w.y - g.startWorld.y
      // a stroke can legitimately be a thin sliver, so it resizes smaller than a box
      const thin = docRef.current.elements.find((el) => el.id === g.id)?.type === 'draw'
      set((d) =>
        updateElement(d, g.id, {
          w: Math.max(thin ? 8 : 40, g.w + dw),
          h: Math.max(thin ? 8 : 28, g.h + dh),
        })
      )
    } else if (g.mode === 'draw') {
      const w = toWorld(e.clientX, e.clientY)
      const n = g.points.length
      // thin the trail out: sub-pixel samples only bloat the stored stroke
      if (Math.hypot(w.x - g.points[n - 2], w.y - g.points[n - 1]) * vpRef.current.zoom < 1.2) return
      g.points.push(w.x, w.y)
      setLiveStroke(g.points.slice())
    } else if (g.mode === 'erase') {
      eraseAt(toWorld(e.clientX, e.clientY))
    } else if (g.mode === 'marquee') {
      const w = toWorld(e.clientX, e.clientY)
      const rect = {
        x: Math.min(g.startWorld.x, w.x),
        y: Math.min(g.startWorld.y, w.y),
        w: Math.abs(w.x - g.startWorld.x),
        h: Math.abs(w.y - g.startWorld.y),
      }
      setMarquee(rect)
      const hit = new Set<string>()
      for (const el of docRef.current.elements) {
        if (el.type === 'frame') {
          // frames join a marquee only when fully enclosed
          if (
            el.x >= rect.x &&
            el.x + el.w <= rect.x + rect.w &&
            el.y >= rect.y &&
            el.y + el.h <= rect.y + rect.h
          )
            hit.add(el.id)
        } else if (
          el.x < rect.x + rect.w &&
          el.x + el.w > rect.x &&
          el.y < rect.y + rect.h &&
          el.y + el.h > rect.y
        )
          hit.add(el.id)
      }
      setSelection(hit)
    } else if (g.mode === 'connect') {
      const targetId = elementUnderPointer(e)
      setTempConn({
        fixedId: g.fromId,
        fixedSide: g.fromSide,
        freeWorld: toWorld(e.clientX, e.clientY),
        targetId: targetId !== g.fromId ? targetId : null,
        freeIsTo: true,
      })
    } else if (g.mode === 'reconnect') {
      const conn = docRef.current.connectors.find((c) => c.id === g.connectorId)
      if (!conn) return
      const fixedId = g.end === 'from' ? conn.to : conn.from
      const fixedSide = g.end === 'from' ? conn.toSide : conn.fromSide
      const targetId = elementUnderPointer(e)
      setTempConn({
        fixedId,
        fixedSide,
        freeWorld: toWorld(e.clientX, e.clientY),
        targetId: targetId !== fixedId ? targetId : null,
        reconnectingId: g.connectorId,
        freeIsTo: g.end === 'to',
      })
    }
  }

  function handleRootPointerUp(e: React.PointerEvent) {
    const g = gesture.current
    gesture.current = null
    setIsPanning(false)
    setMarquee(null)
    bumpGestureTick((t) => t + 1)
    if (!g) return
    if (g.mode === 'drag' && g.moved) pushHistory(g.base)
    if (g.mode === 'resize') pushHistory(g.base)
    if (g.mode === 'draw') {
      setLiveStroke(null)
      const el = strokeElement(g.points, drawSettings.pen, drawSettings.color, drawSettings.size)
      if (el) commit((d) => addElement(d, el))
    }
    if (g.mode === 'erase' && g.erased.size > 0) pushHistory(g.base)
    if (g.mode === 'connect') {
      const drag = tempConn
      setTempConn(null)
      if (!drag) return
      if (drag.targetId) {
        const target = docRef.current.elements.find((el) => el.id === drag.targetId)
        const toSide = target ? nearestSide(target, drag.freeWorld) : undefined
        commit((d) =>
          addConnector(d, {
            id: newId(),
            from: g.fromId,
            to: drag.targetId!,
            fromSide: g.fromSide,
            toSide,
          })
        )
      } else {
        // dropped on empty canvas — spawn a connected sticky (mind-map flow)
        const source = docRef.current.elements.find((el) => el.id === g.fromId)
        const d = DEFAULTS.sticky
        const el: CanvasElement = {
          id: newId(),
          type: 'sticky',
          x: drag.freeWorld.x - d.w / 2,
          y: drag.freeWorld.y - d.h / 2,
          w: d.w,
          h: d.h,
          text: '',
          color: source?.type === 'sticky' ? source.color : 'yellow',
        }
        commit((doc) =>
          addConnector(addElement(doc, el), {
            id: newId(),
            from: g.fromId,
            to: el.id,
            fromSide: g.fromSide,
          })
        )
        setSelection(new Set([el.id]))
        editBase.current = docRef.current
        setEditingId(el.id)
      }
    }
    if (g.mode === 'reconnect') {
      const drag = tempConn
      setTempConn(null)
      if (!drag) return
      const conn = docRef.current.connectors.find((c) => c.id === g.connectorId)
      if (!conn) return
      const otherEnd = g.end === 'from' ? conn.to : conn.from
      if (drag.targetId && drag.targetId !== otherEnd) {
        const target = docRef.current.elements.find((el) => el.id === drag.targetId)
        const side = target ? nearestSide(target, drag.freeWorld) : undefined
        commit((d) =>
          updateConnector(d, g.connectorId, {
            [g.end]: drag.targetId!,
            [g.end === 'from' ? 'fromSide' : 'toSide']: side,
          })
        )
      }
      // dropped on empty canvas or on the other end: keep the original attachment
    }
  }

  function handleRootDoubleClick(e: React.MouseEvent) {
    // pointer capture can retarget dblclick to the root, so hit-test the actual
    // point instead of trusting e.target
    if (editingId || drawing) return
    const under = document.elementFromPoint(e.clientX, e.clientY)
    if (under?.closest('[data-element-id], .connector-label, .connector-hit, .endpoint-dot')) return
    const w = toWorld(e.clientX, e.clientY)
    createElement('text', w.x + DEFAULTS.text.w / 2, w.y + DEFAULTS.text.h / 2)
  }

  /* ---------- wheel: pan + zoom ---------- */

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      // let overlays (slash menu, pickers, toolbars) scroll natively
      if ((e.target as HTMLElement).closest?.('.slash-menu, .picker, .sel-toolbar')) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.012)
        setVp((v) => {
          const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
          const k = zoom / v.zoom
          return {
            zoom,
            x: e.clientX - (e.clientX - v.x) * k,
            y: e.clientY - (e.clientY - v.y) * k,
          }
        })
      } else {
        setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- clipboard ---------- */

  function copySelection() {
    const els = docRef.current.elements.filter((el) => selection.has(el.id))
    if (els.length === 0) return false
    const conns = docRef.current.connectors.filter((c) => selection.has(c.from) && selection.has(c.to))
    clipboard.current = JSON.parse(JSON.stringify({ elements: els, connectors: conns }))
    return true
  }

  function pasteClipboard(at: { x: number; y: number }) {
    const clip = clipboard.current
    if (!clip || clip.elements.length === 0) return
    const minX = Math.min(...clip.elements.map((e) => e.x))
    const minY = Math.min(...clip.elements.map((e) => e.y))
    const maxX = Math.max(...clip.elements.map((e) => e.x + e.w))
    const maxY = Math.max(...clip.elements.map((e) => e.y + e.h))
    const dx = at.x - (minX + maxX) / 2
    const dy = at.y - (minY + maxY) / 2
    const idMap = new Map<string, string>()
    const newEls = clip.elements.map((el) => {
      const id = newId()
      idMap.set(el.id, id)
      return { ...el, id, x: el.x + dx, y: el.y + dy }
    })
    const newConns = clip.connectors.map((c) => ({
      ...c,
      id: newId(),
      from: idMap.get(c.from)!,
      to: idMap.get(c.to)!,
    }))
    commit((d) => ({
      elements: [...d.elements, ...newEls],
      connectors: [...d.connectors, ...newConns],
    }))
    setSelection(new Set(newEls.map((e) => e.id)))
    setSelectedConnector(null)
  }

  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping()) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault()
        insertImageFiles(files, toWorld(mouse.current.x, mouse.current.y))
        return
      }
      if (clipboard.current) {
        e.preventDefault()
        pasteClipboard(toWorld(mouse.current.x, mouse.current.y))
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTyping()) setSpaceDown(true)
      if (isTyping()) return

      const mod = e.metaKey || e.ctrlKey
      if (!mod && !e.altKey) {
        // pen shortcuts: P enters drawing mode from anywhere, the rest
        // switch tools once you are in it
        const k = e.key.toLowerCase()
        if (k === 'p') {
          e.preventDefault()
          enterDrawMode({ pen: 'pen' })
          return
        }
        if (drawing) {
          if (k === 'm' || k === 'h') {
            e.preventDefault()
            setDrawSettings((s) => ({ ...s, pen: k === 'm' ? 'marker' : 'highlighter', eraser: false }))
            return
          }
          if (k === 'e') {
            e.preventDefault()
            setDrawSettings((s) => ({ ...s, eraser: true }))
            return
          }
          if (e.key === '[' || e.key === ']') {
            e.preventDefault()
            setDrawSettings((s) => {
              const i = PEN_SIZES.indexOf(s.size)
              const next = Math.min(PEN_SIZES.length - 1, Math.max(0, (i < 0 ? 1 : i) + (e.key === ']' ? 1 : -1)))
              return { ...s, size: PEN_SIZES[next], eraser: false }
            })
            return
          }
        }
      }
      if (e.key === '/' && !mod) {
        e.preventDefault()
        const { x, y } = mouse.current
        const w = toWorld(x, y)
        setSlash({ screenX: x, screenY: y, worldX: w.x, worldY: w.y })
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        copySelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'x') {
        if (copySelection()) deleteSelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelection(new Set(docRef.current.elements.map((el) => el.id)))
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (e.key === 'Escape') {
        setSelection(new Set())
        setSelectedConnector(null)
        setSlash(null)
        setPicker(null)
        setDrawing(false)
        return
      }
      if (e.key === 'Enter' && selection.size === 1) {
        const el = docRef.current.elements.find((x) => selection.has(x.id))
        if (el && EDITABLE_TYPES.includes(el.type)) {
          e.preventDefault()
          startEditing(el)
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, selectedConnector, drawing, undo, redo])

  /* ---------- selection ops ---------- */

  function deleteSelection() {
    if (selectedConnector) {
      commit((d) => removeConnector(d, selectedConnector))
      setSelectedConnector(null)
      return
    }
    if (selection.size > 0) {
      commit((d) => removeElements(d, selection))
      setSelection(new Set())
    }
  }

  function duplicateSelection() {
    if (selection.size === 0) return
    const clones: CanvasElement[] = []
    commit((d) => {
      let next = d
      for (const el of d.elements) {
        if (!selection.has(el.id)) continue
        const clone = { ...el, id: newId(), x: el.x + 24, y: el.y + 24 }
        clones.push(clone)
        next = addElement(next, clone)
      }
      return next
    })
    setSelection(new Set(clones.map((c) => c.id)))
  }

  function setSelectionColor(color: string) {
    commit((d) =>
      updateElements(d, selection, (el) => {
        // ink and fill are separate palettes: in a mixed selection, a key from
        // one of them must not land on an element that reads the other
        const known = el.type === 'draw' ? !!PEN_COLORS[color] : color === 'none' || !!COLORS[color]
        return known ? { ...el, color } : el
      })
    )
  }

  function setSelectionBorder(border: string) {
    commit((d) => updateElements(d, selection, (el) => ({ ...el, border })))
  }

  /* ---------- text formatting ---------- */

  function stepFontSize(dir: 1 | -1) {
    commit((d) =>
      updateElements(d, selection, (el) => {
        if (el.type !== 'text' && el.type !== 'heading') return el
        const cur = effectiveFontSize(el)
        const next =
          dir === 1
            ? (FONT_SIZES.find((s) => s > cur) ?? FONT_SIZES[FONT_SIZES.length - 1])
            : ([...FONT_SIZES].reverse().find((s) => s < cur) ?? FONT_SIZES[0])
        if (next === cur) return el
        // keep the box proportional so multi-line text stays visible
        return { ...el, fontSize: next, h: Math.max(28, Math.round(el.h * (next / cur))) }
      })
    )
  }

  function toggleBold() {
    commit((d) =>
      updateElements(d, selection, (el) => ({ ...el, bold: !(effectiveWeight(el) >= 700) }))
    )
  }

  function setAlign(align: TextAlign) {
    commit((d) => updateElements(d, selection, (el) => ({ ...el, align })))
  }

  function setHeadingLevel(level: number) {
    commit((d) =>
      updateElements(d, selection, (el) => {
        if (el.type !== 'heading') return el
        const cur = effectiveFontSize(el)
        const next = HEADING_SIZES[level].size
        return {
          ...el,
          level,
          fontSize: undefined,
          bold: undefined,
          h: Math.max(HEADING_SIZES[level].h, Math.round(el.h * (next / cur))),
        }
      })
    )
  }

  /* ---------- frame export ---------- */

  async function exportFrame(format: 'png' | 'pdf') {
    const frame = docRef.current.elements.find((el) => selection.has(el.id) && el.type === 'frame')
    const world = worldRef.current
    if (!frame || !world) return
    // hide selection chrome before capturing
    setSelection(new Set())
    await new Promise((r) => setTimeout(r, 100))
    try {
      if (format === 'png') await exportFramePng(world, frame)
      else await exportFramePdf(world, frame)
    } catch (err) {
      console.error(err)
      window.alert('Export failed — an image on the board may block cross-origin export.')
    } finally {
      setSelection(new Set([frame.id]))
    }
  }

  /* ---------- board files ---------- */

  async function importBoardFromFile(file: File) {
    try {
      const { name, doc: imported } = parseBoardFile(await file.text())
      createBoard(name, imported)
    } catch {
      window.alert('Could not import: not a valid Goya board file.')
    }
  }

  /* ---------- zoom controls ---------- */

  function zoomBy(factor: number) {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    setVp((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
      const k = zoom / v.zoom
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }

  function fitContent() {
    const els = docRef.current.elements
    if (els.length === 0) {
      setVp({ x: 0, y: 0, zoom: 1 })
      return
    }
    const minX = Math.min(...els.map((e) => e.x))
    const minY = Math.min(...els.map((e) => e.y))
    const maxX = Math.max(...els.map((e) => e.x + e.w))
    const maxY = Math.max(...els.map((e) => e.y + e.h))
    const pad = 80
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (window.innerWidth - pad * 2) / (maxX - minX || 1),
          (window.innerHeight - pad * 2) / (maxY - minY || 1),
          1.5
        )
      )
    )
    setVp({
      zoom,
      x: (window.innerWidth - (maxX + minX) * zoom) / 2,
      y: (window.innerHeight - (maxY + minY) * zoom) / 2,
    })
  }

  /* ---------- render ---------- */

  const selectedEls = useMemo(
    () => doc.elements.filter((el) => selection.has(el.id)),
    [doc.elements, selection]
  )

  // selection toolbar anchor (screen coords, above selection bounds)
  let toolbarPos: { x: number; y: number } | null = null
  if (selectedEls.length > 0 && !editingId && !gesture.current) {
    const minX = Math.min(...selectedEls.map((e) => e.x))
    const maxX = Math.max(...selectedEls.map((e) => e.x + e.w))
    const minY = Math.min(...selectedEls.map((e) => e.y))
    const p = toScreen((minX + maxX) / 2, minY)
    toolbarPos = { x: p.x, y: p.y - 14 }
  }

  // connector toolbar + labels
  const elById = useMemo(() => new Map(doc.elements.map((e) => [e.id, e])), [doc.elements])
  const selectedConn = selectedConnector
    ? doc.connectors.find((c) => c.id === selectedConnector) ?? null
    : null
  let connToolbarPos: { x: number; y: number } | null = null
  if (selectedConn && !editingConnLabel && !gesture.current && !tempConn) {
    const from = elById.get(selectedConn.from)
    const to = elById.get(selectedConn.to)
    if (from && to) {
      const geo = connectorGeometry(from, to, selectedConn.fromSide, selectedConn.toSide)
      const p = toScreen(geo.mid.x, geo.mid.y)
      connToolbarPos = { x: p.x, y: p.y - 18 }
    }
  }

  // frames render behind everything else
  const orderedElements = useMemo(() => {
    const frames = doc.elements.filter((e) => e.type === 'frame')
    const rest = doc.elements.filter((e) => e.type !== 'frame')
    return [...frames, ...rest]
  }, [doc.elements])

  const gridSize = 24 * vp.zoom

  return (
    <div
      ref={rootRef}
      className={
        'canvas-root' +
        (isPanning ? ' panning' : '') +
        (spaceDown ? ' space-pan' : '') +
        (drawing ? ' draw-mode' : '') +
        (drawing && !spaceDown ? (drawSettings.eraser ? ' erasing' : ' drawing') : '')
      }
      onPointerDown={handleRootPointerDown}
      onPointerMove={handleRootPointerMove}
      onPointerUp={handleRootPointerUp}
      onDoubleClick={handleRootDoubleClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const files = Array.from(e.dataTransfer?.files ?? [])
        if (files.length > 0) insertImageFiles(files, toWorld(e.clientX, e.clientY))
      }}
    >
      <div
        className="dot-grid"
        style={{
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${vp.x}px ${vp.y}px`,
          opacity: vp.zoom > 0.3 ? 1 : 0,
        }}
      />
      <div
        ref={worldRef}
        className="world"
        style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}
      >
        <ConnectorLayer
          elements={doc.elements}
          connectors={doc.connectors}
          selectedConnector={selectedConnector}
          temp={tempConn}
          onSelectConnector={(id) => {
            setSelectedConnector(id)
            setSelection(new Set())
          }}
          onConnectorDoubleClick={(id) => {
            setSelectedConnector(id)
            setSelection(new Set())
            setEditingConnLabel(id)
          }}
        />
        {doc.connectors.map((c) => {
          const editing = editingConnLabel === c.id
          if (!c.label && !editing) return null
          const from = elById.get(c.from)
          const to = elById.get(c.to)
          if (!from || !to) return null
          const geo = connectorGeometry(from, to, c.fromSide, c.toSide)
          return (
            <ConnectorLabel
              key={c.id}
              connector={c}
              x={geo.mid.x}
              y={geo.mid.y}
              editing={editing}
              selected={selectedConnector === c.id}
              onSelect={() => {
                setSelectedConnector(c.id)
                setSelection(new Set())
              }}
              onStartEdit={() => {
                setSelectedConnector(c.id)
                setEditingConnLabel(c.id)
              }}
              onCommit={(text) => {
                setEditingConnLabel(null)
                commit((d) => updateConnector(d, c.id, { label: text.trim() || undefined }))
              }}
            />
          )
        })}
        {orderedElements.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            selected={selection.has(el.id)}
            editing={editingId === el.id}
            connectTarget={tempConn?.targetId === el.id && tempConn?.fixedId !== el.id}
            zoom={vp.zoom}
            onPointerDown={handleElementPointerDown}
            onDoubleClick={handleElementDoubleClick}
            onTextChange={handleTextChange}
            onEditEnd={handleEditEnd}
            onResizeStart={handleResizeStart}
            onPortDown={handlePortDown}
          />
        ))}
        {selectedConn &&
          !tempConn &&
          (() => {
            const from = elById.get(selectedConn.from)
            const to = elById.get(selectedConn.to)
            if (!from || !to) return null
            const geo = connectorGeometry(from, to, selectedConn.fromSide, selectedConn.toSide)
            return (['from', 'to'] as const).map((end) => {
              const p = end === 'from' ? geo.start : geo.end
              return (
                <div
                  key={end}
                  className="endpoint-dot"
                  style={{ left: p.x, top: p.y }}
                  title="Drag to reattach"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    handleEndpointDown(e, selectedConn.id, end)
                  }}
                />
              )
            })
          })()}
        {liveStroke && (() => {
          const style = PEN_STYLES[drawSettings.pen]
          const ink = PEN_COLORS[drawSettings.color] ?? PEN_COLORS.ink
          return (
            <svg className="live-stroke" width={1} height={1}>
              <path
                // the trail is already in world coordinates, so it needs no scaling
                d={strokePath(liveStroke, 1, 1)}
                fill="none"
                stroke={ink.stroke}
                strokeWidth={drawSettings.size * style.width}
                strokeLinecap={style.cap}
                strokeLinejoin="round"
                opacity={style.opacity}
                style={{ mixBlendMode: style.blend }}
              />
            </svg>
          )
        })()}
        {marquee && (
          <div
            className="marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>

      <div className="top-bar">
        <div className="wordmark">
          <span className="dot" />
          Goya
        </div>
        <button
          className="board-switcher"
          title="Boards"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setBoardsOpen((o) => !o)}
        >
          {activeBoard.name}
          <span className="chevron">▾</span>
        </button>
        <div className="hint-pill">
          {drawing ? (
            <>
              Drawing — drag to sketch, <kbd>esc</kbd> to stop
            </>
          ) : (
            <>
              Press <kbd>/</kbd> to add
            </>
          )}
        </div>
      </div>

      {boardsOpen && (
        <BoardsPanel
          boards={boards}
          activeId={activeBoard.id}
          onSwitch={(id) => {
            switchBoard(id)
            setBoardsOpen(false)
            setSelection(new Set())
            setSelectedConnector(null)
            setEditingId(null)
          }}
          onCreate={() => {
            createBoard(`Board ${boards.length + 1}`)
            setSelection(new Set())
            setSelectedConnector(null)
            setBoardsOpen(false)
          }}
          onRename={renameBoard}
          onDelete={(id) => {
            deleteBoard(id)
            setSelection(new Set())
            setSelectedConnector(null)
          }}
          onExportFile={() => exportBoardFile(activeBoard.name, docRef.current)}
          onImportFile={importBoardFromFile}
          onClose={() => setBoardsOpen(false)}
        />
      )}

      {doc.elements.length === 0 && !slash && !picker && !boardsOpen && !drawing && (
        <div className="empty-state">
          <div className="big">
            Press <kbd>/</kbd> anywhere to add a sticky note, text, emoji, icon, or image
          </div>
          <div>
            Double-click for text · <kbd>P</kbd> to draw · drag from a note’s edge to branch out
          </div>
        </div>
      )}

      {toolbarPos && (
        <SelectionToolbar
          x={toolbarPos.x}
          y={toolbarPos.y}
          elements={selectedEls}
          onColor={setSelectionColor}
          onBorder={setSelectionBorder}
          onFontStep={stepFontSize}
          onToggleBold={toggleBold}
          onAlign={setAlign}
          onLevel={setHeadingLevel}
          onDuplicate={duplicateSelection}
          onDelete={deleteSelection}
          onExportPng={() => exportFrame('png')}
          onExportPdf={() => exportFrame('pdf')}
        />
      )}

      {connToolbarPos && selectedConn && (
        <ConnectorToolbar
          x={connToolbarPos.x}
          y={connToolbarPos.y}
          active={selectedConn.style ?? 'solid'}
          onStyle={(style) => commit((d) => updateConnector(d, selectedConn.id, { style }))}
          onLabel={() => setEditingConnLabel(selectedConn.id)}
          onDelete={deleteSelection}
        />
      )}

      {slash && (
        <SlashMenu
          x={slash.screenX}
          y={slash.screenY}
          onSelect={handleSlashAction}
          onClose={() => setSlash(null)}
        />
      )}

      {picker?.kind === 'icon' && (
        <IconPicker
          x={picker.screenX}
          y={picker.screenY}
          onSelect={(name) => {
            createElement('icon', picker.worldX, picker.worldY, { icon: name })
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {picker?.kind === 'emoji' && (
        <EmojiPicker
          x={picker.screenX}
          y={picker.screenY}
          onSelect={(emoji) => {
            createElement('emoji', picker.worldX, picker.worldY, { text: emoji })
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {picker?.kind === 'image' && (
        <ImagePicker
          x={picker.screenX}
          y={picker.screenY}
          onSelect={(img) => {
            const maxW = 360
            const ratio = img.height / Math.max(1, img.width)
            const w = Math.min(maxW, img.width)
            const h = Math.max(60, w * ratio)
            createElement('image', picker.worldX, picker.worldY, {
              url: img.full,
              w,
              h,
              text: img.title,
              credit: img.credit,
            })
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? [])
          const at = uploadPoint.current ?? toWorld(window.innerWidth / 2, window.innerHeight / 2)
          if (files.length > 0) insertImageFiles(files, at)
          e.currentTarget.value = ''
        }}
      />

      {drawing && (
        <DrawToolbar
          settings={drawSettings}
          onChange={(patch) => setDrawSettings((s) => ({ ...s, ...patch }))}
          onDone={() => setDrawing(false)}
        />
      )}

      <ZoomControls
        zoom={vp.zoom}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onReset={() => setVp((v) => ({ ...v, zoom: 1 }))}
        onFit={fitContent}
      />
    </div>
  )
}

/* ---------- connector label ---------- */

function ConnectorLabel({
  connector,
  x,
  y,
  editing,
  selected,
  onSelect,
  onStartEdit,
  onCommit,
}: {
  connector: Connector
  x: number
  y: number
  editing: boolean
  selected: boolean
  onSelect: () => void
  onStartEdit: () => void
  onCommit: (text: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (node.innerText !== (connector.label ?? '')) node.innerText = connector.label ?? ''
    if (editing) {
      node.focus()
      const range = document.createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [editing, connector.id, connector.label])

  return (
    <div
      className={`connector-label${selected ? ' selected' : ''}${editing ? ' editing' : ''}`}
      style={{ left: x, top: y }}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (!editing) onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEdit()
      }}
    >
      <div
        ref={ref}
        className="connector-label-text"
        contentEditable={editing}
        suppressContentEditableWarning
        data-placeholder="Label"
        onBlur={(e) => editing && onCommit(e.currentTarget.innerText)}
        onKeyDown={(e) => {
          if (!editing) return
          e.stopPropagation()
          if (e.key === 'Escape' || e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
