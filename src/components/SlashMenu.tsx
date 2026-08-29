import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  StickyNote,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Smile,
  SmilePlus,
  Image as ImageIcon,
  Upload,
  Square,
  Circle,
  Frame,
  Search,
  Pen,
  Highlighter,
} from 'lucide-react'
import { CanvasElement, ElementType, PenTool } from '../types'

export type SlashAction =
  | { kind: 'create'; type: ElementType; extra?: Partial<CanvasElement> }
  | { kind: 'icon-picker' }
  | { kind: 'emoji-picker' }
  | { kind: 'image-picker' }
  | { kind: 'upload-image' }
  | { kind: 'draw'; pen: PenTool }

export interface SlashItem {
  id: string
  label: string
  desc: string
  keywords: string
  section: string
  icon: React.ReactNode
  action: SlashAction
}

const ITEMS: SlashItem[] = [
  {
    id: 'sticky',
    label: 'Sticky note',
    desc: 'Capture an idea',
    keywords: 'sticky note post-it postit idea note',
    section: 'Basics',
    icon: <StickyNote size={17} />,
    action: { kind: 'create', type: 'sticky' },
  },
  {
    id: 'text',
    label: 'Text',
    desc: 'Plain text on the canvas',
    keywords: 'text paragraph label write',
    section: 'Basics',
    icon: <Type size={17} />,
    action: { kind: 'create', type: 'text' },
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    desc: 'Big section title',
    keywords: 'heading title header h1 section big large',
    section: 'Basics',
    icon: <Heading1 size={17} />,
    action: { kind: 'create', type: 'heading', extra: { level: 1 } },
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    desc: 'Medium section title',
    keywords: 'heading title header h2 section medium',
    section: 'Basics',
    icon: <Heading2 size={17} />,
    action: { kind: 'create', type: 'heading', extra: { level: 2, w: 360, h: 50 } },
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    desc: 'Small section title',
    keywords: 'heading title header h3 section small',
    section: 'Basics',
    icon: <Heading3 size={17} />,
    action: { kind: 'create', type: 'heading', extra: { level: 3, w: 320, h: 42 } },
  },
  {
    id: 'heading4',
    label: 'Heading 4',
    desc: 'Tiny section title',
    keywords: 'heading title header h4 section tiny subtitle',
    section: 'Basics',
    icon: <Heading4 size={17} />,
    action: { kind: 'create', type: 'heading', extra: { level: 4, w: 280, h: 36 } },
  },
  {
    id: 'icon',
    label: 'Icon',
    desc: 'Search 1,500+ icons',
    keywords: 'icon symbol glyph pictogram',
    section: 'Media',
    icon: <Smile size={17} />,
    action: { kind: 'icon-picker' },
  },
  {
    id: 'emoji',
    label: 'Emoji',
    desc: 'Browse and search all emoji',
    keywords: 'emoji emoticon smiley face reaction',
    section: 'Media',
    icon: <SmilePlus size={17} />,
    action: { kind: 'emoji-picker' },
  },
  {
    id: 'image',
    label: 'Image from web',
    desc: 'Search the web for images',
    keywords: 'image picture photo web search unsplash gif media',
    section: 'Media',
    icon: <ImageIcon size={17} />,
    action: { kind: 'image-picker' },
  },
  {
    id: 'upload',
    label: 'Upload image',
    desc: 'Add an image from your computer',
    keywords: 'upload image file photo picture import local computer',
    section: 'Media',
    icon: <Upload size={17} />,
    action: { kind: 'upload-image' },
  },
  {
    id: 'draw',
    label: 'Drawing',
    desc: 'Freehand pen — sketch anywhere on the canvas',
    keywords: 'draw drawing pen ink sketch scribble doodle freehand write marker annotate',
    section: 'Draw',
    icon: <Pen size={17} />,
    action: { kind: 'draw', pen: 'pen' },
  },
  {
    id: 'highlighter',
    label: 'Highlighter',
    desc: 'Translucent ink for marking things up',
    keywords: 'highlighter highlight marker draw ink annotate emphasize',
    section: 'Draw',
    icon: <Highlighter size={17} />,
    action: { kind: 'draw', pen: 'highlighter' },
  },
  {
    id: 'rect',
    label: 'Rectangle',
    desc: 'Shape with text',
    keywords: 'rectangle shape box square container',
    section: 'Shapes',
    icon: <Square size={17} />,
    action: { kind: 'create', type: 'rect' },
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    desc: 'Shape with text',
    keywords: 'ellipse circle oval shape round',
    section: 'Shapes',
    icon: <Circle size={17} />,
    action: { kind: 'create', type: 'ellipse' },
  },
  {
    id: 'frame',
    label: 'Frame',
    desc: 'Group an area — export as PNG or PDF',
    keywords: 'frame group section area export pdf png slide board',
    section: 'Shapes',
    icon: <Frame size={17} />,
    action: { kind: 'create', type: 'frame' },
  },
]

interface Props {
  x: number
  y: number
  onSelect: (action: SlashAction) => void
  onClose: () => void
}

export function SlashMenu({ x, y, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ITEMS
    return ITEMS.filter(
      (it) => it.label.toLowerCase().includes(q) || it.keywords.includes(q)
    )
  }, [query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const node = listRef.current?.querySelectorAll('.slash-item')[active]
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // clamp to viewport
  const width = 320
  const maxH = 400
  const left = Math.min(x, window.innerWidth - width - 12)
  const top = Math.min(y, window.innerHeight - maxH - 12)

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[active]) onSelect(filtered[active].action)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
    e.stopPropagation()
  }

  // group into sections, preserving order
  const sections: { name: string; items: { item: SlashItem; index: number }[] }[] = []
  filtered.forEach((item, index) => {
    const last = sections[sections.length - 1]
    if (!last || last.name !== item.section) sections.push({ name: item.section, items: [{ item, index }] })
    else last.items.push({ item, index })
  })

  return (
    <div className="slash-menu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="slash-input-row">
        <Search size={15} />
        <input
          ref={inputRef}
          className="slash-input"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          onBlur={(e) => {
            // close when focus leaves the menu entirely
            if (!e.currentTarget.closest('.slash-menu')?.contains(e.relatedTarget as Node)) onClose()
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="slash-list" ref={listRef}>
        {sections.map((s) => (
          <React.Fragment key={s.name}>
            <div className="slash-section">{s.name}</div>
            {s.items.map(({ item, index }) => (
              <button
                key={item.id}
                className={`slash-item${index === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onSelect(item.action)}
              >
                <span className="item-icon">{item.icon}</span>
                <span>
                  <div className="item-label">{item.label}</div>
                  <div className="item-desc">{item.desc}</div>
                </span>
              </button>
            ))}
          </React.Fragment>
        ))}
        {filtered.length === 0 && <div className="slash-empty">No matches</div>}
      </div>
    </div>
  )
}
