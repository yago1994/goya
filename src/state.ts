import { useCallback, useEffect, useRef, useState } from 'react'
import { BoardMeta, CanvasElement, Connector, DOC_VERSION, DocState, newId } from './types'

const INDEX_KEY = 'goya-boards-v1'
const LEGACY_KEY = 'goya-doc-v1'
const boardKey = (id: string) => `goya-board-${id}`

const EMPTY: DocState = { elements: [], connectors: [], v: DOC_VERSION }

interface BoardIndex {
  boards: BoardMeta[]
  activeId: string
}

export function migrateDoc(doc: DocState): DocState {
  if ((doc.v ?? 1) >= DOC_VERSION) return doc
  // v1 → v2: text/heading elements carried an unused default color:'blue'
  // that would now render as a blue font — strip it
  return {
    ...doc,
    v: DOC_VERSION,
    elements: doc.elements.map((e) =>
      (e.type === 'text' || e.type === 'heading') && e.color ? { ...e, color: undefined } : e
    ),
  }
}

function parseDoc(raw: string | null): DocState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.elements) && Array.isArray(parsed.connectors)) return migrateDoc(parsed)
  } catch {
    // corrupted — ignore
  }
  return null
}

function loadIndex(): BoardIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (raw) {
      const idx = JSON.parse(raw) as BoardIndex
      if (Array.isArray(idx.boards) && idx.boards.length > 0) {
        if (!idx.boards.some((b) => b.id === idx.activeId)) idx.activeId = idx.boards[0].id
        return idx
      }
    }
  } catch {
    // fall through to create
  }
  // migrate the single-board legacy key, or start fresh
  const id = newId()
  const legacy = parseDoc(localStorage.getItem(LEGACY_KEY))
  const idx: BoardIndex = {
    boards: [{ id, name: 'My board', updatedAt: Date.now() }],
    activeId: id,
  }
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx))
    if (legacy) {
      localStorage.setItem(boardKey(id), JSON.stringify(legacy))
      localStorage.removeItem(LEGACY_KEY)
    }
  } catch {
    // storage unavailable — in-memory only
  }
  return idx
}

function loadBoard(id: string): DocState {
  return parseDoc(localStorage.getItem(boardKey(id))) ?? EMPTY
}

function saveIndex(idx: BoardIndex) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx))
  } catch {
    // storage full
  }
}

/**
 * Multi-board document store with snapshot-based undo/redo per session.
 * - `set` mutates the live doc without recording history (mid-drag, mid-typing).
 * - `commit` mutates and records the previous state as an undo step.
 * - `pushHistory(base)` records an explicit base snapshot (for gestures).
 */
export function useDoc() {
  const [index, setIndex] = useState<BoardIndex>(loadIndex)
  const [doc, setDoc] = useState<DocState>(() => loadBoard(index.activeId))
  const docRef = useRef(doc)
  docRef.current = doc
  const indexRef = useRef(index)
  indexRef.current = index
  const undoStack = useRef<DocState[]>([])
  const redoStack = useRef<DocState[]>([])

  // autosave the active board (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(boardKey(indexRef.current.activeId), JSON.stringify(doc))
        const idx = indexRef.current
        const next = {
          ...idx,
          boards: idx.boards.map((b) =>
            b.id === idx.activeId ? { ...b, updatedAt: Date.now() } : b
          ),
        }
        indexRef.current = next
        setIndex(next)
        saveIndex(next)
      } catch {
        // storage full — skip autosave
      }
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  const set = useCallback((fn: (d: DocState) => DocState) => {
    setDoc((d) => fn(d))
  }, [])

  /**
   * StrictMode invokes state updaters twice in development, so recording
   * history has to be idempotent — the same base landing on the stack twice
   * would make every undo step fire twice.
   */
  const push = (base: DocState) => {
    if (undoStack.current[undoStack.current.length - 1] === base) return
    undoStack.current.push(base)
    if (undoStack.current.length > 200) undoStack.current.shift()
    redoStack.current = []
  }

  const commit = useCallback((fn: (d: DocState) => DocState) => {
    setDoc((d) => {
      const next = fn(d)
      if (next === d) return d
      push(d)
      return next
    })
  }, [])

  const pushHistory = useCallback((base: DocState) => {
    if (base !== docRef.current) push(base)
  }, [])

  // popping happens outside the updater — see the note on `push`
  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(docRef.current)
    setDoc(prev)
  }, [])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(docRef.current)
    setDoc(next)
  }, [])

  /* ---------- boards ---------- */

  const flushActive = () => {
    try {
      localStorage.setItem(boardKey(indexRef.current.activeId), JSON.stringify(docRef.current))
    } catch {
      // storage full
    }
  }

  const applyIndex = (next: BoardIndex) => {
    indexRef.current = next
    setIndex(next)
    saveIndex(next)
  }

  const switchBoard = useCallback((id: string) => {
    if (id === indexRef.current.activeId) return
    flushActive()
    applyIndex({ ...indexRef.current, activeId: id })
    undoStack.current = []
    redoStack.current = []
    setDoc(loadBoard(id))
  }, [])

  const createBoard = useCallback((name: string, initial?: DocState): string => {
    flushActive()
    const id = newId()
    try {
      localStorage.setItem(boardKey(id), JSON.stringify(initial ?? EMPTY))
    } catch {
      // storage full
    }
    applyIndex({
      boards: [...indexRef.current.boards, { id, name, updatedAt: Date.now() }],
      activeId: id,
    })
    undoStack.current = []
    redoStack.current = []
    setDoc(initial ?? EMPTY)
    return id
  }, [])

  const renameBoard = useCallback((id: string, name: string) => {
    applyIndex({
      ...indexRef.current,
      boards: indexRef.current.boards.map((b) => (b.id === id ? { ...b, name } : b)),
    })
  }, [])

  const deleteBoard = useCallback((id: string) => {
    const idx = indexRef.current
    const remaining = idx.boards.filter((b) => b.id !== id)
    try {
      localStorage.removeItem(boardKey(id))
    } catch {
      // ignore
    }
    if (remaining.length === 0) {
      const nid = newId()
      applyIndex({ boards: [{ id: nid, name: 'My board', updatedAt: Date.now() }], activeId: nid })
      undoStack.current = []
      redoStack.current = []
      setDoc(EMPTY)
      return
    }
    const activeId = id === idx.activeId ? remaining[0].id : idx.activeId
    applyIndex({ boards: remaining, activeId })
    if (id === idx.activeId) {
      undoStack.current = []
      redoStack.current = []
      setDoc(loadBoard(activeId))
    }
  }, [])

  const activeBoard = index.boards.find((b) => b.id === index.activeId) ?? index.boards[0]

  return {
    doc,
    docRef,
    set,
    commit,
    pushHistory,
    undo,
    redo,
    boards: index.boards,
    activeBoard,
    switchBoard,
    createBoard,
    renameBoard,
    deleteBoard,
  }
}

export function updateElement(d: DocState, id: string, patch: Partial<CanvasElement>): DocState {
  return {
    ...d,
    elements: d.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }
}

export function updateElements(
  d: DocState,
  ids: Set<string>,
  fn: (e: CanvasElement) => CanvasElement
): DocState {
  return { ...d, elements: d.elements.map((e) => (ids.has(e.id) ? fn(e) : e)) }
}

export function addElement(d: DocState, el: CanvasElement): DocState {
  return { ...d, elements: [...d.elements, el] }
}

export function removeElements(d: DocState, ids: Set<string>): DocState {
  return {
    elements: d.elements.filter((e) => !ids.has(e.id)),
    connectors: d.connectors.filter((c) => !ids.has(c.from) && !ids.has(c.to)),
  }
}

export function addConnector(d: DocState, c: Connector): DocState {
  // avoid duplicate connectors between the same pair
  if (d.connectors.some((k) => (k.from === c.from && k.to === c.to) || (k.from === c.to && k.to === c.from)))
    return d
  return { ...d, connectors: [...d.connectors, c] }
}

export function removeConnector(d: DocState, id: string): DocState {
  return { ...d, connectors: d.connectors.filter((c) => c.id !== id) }
}

export function updateConnector(d: DocState, id: string, patch: Partial<Connector>): DocState {
  return { ...d, connectors: d.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
}
