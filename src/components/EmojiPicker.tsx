import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import groups from 'unicode-emoji-json/data-by-group.json'
import keywordsByEmoji from 'emojilib'

interface EmojiEntry {
  emoji: string
  name: string
  keywords: string
}

interface EmojiGroup {
  name: string
  entries: EmojiEntry[]
}

const GROUPS: EmojiGroup[] = (groups as any[]).map((g) => ({
  name: g.name,
  entries: g.emojis.map((e: any) => ({
    emoji: e.emoji,
    name: e.name,
    keywords: [e.name, e.slug, ...((keywordsByEmoji as Record<string, string[]>)[e.emoji] ?? [])]
      .join(' ')
      .toLowerCase(),
  })),
}))

const ALL: EmojiEntry[] = GROUPS.flatMap((g) => g.entries)

interface Props {
  x: number
  y: number
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ x, y, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null // show grouped browse view
    return ALL.filter((e) => e.keywords.includes(q)).slice(0, 120)
  }, [query])

  const width = 380
  const left = Math.min(x, window.innerWidth - width - 12)
  const top = Math.min(y, window.innerHeight - 420 - 12)

  return (
    <div className="picker" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="picker-input-row">
        <Search size={15} />
        <input
          ref={inputRef}
          className="picker-input"
          placeholder="Search emoji…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter') {
              const first = filtered ? filtered[0] : ALL[0]
              if (first) onSelect(first.emoji)
            }
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="emoji-scroll">
        {filtered === null ? (
          GROUPS.map((g) => (
            <React.Fragment key={g.name}>
              <div className="emoji-group-name">{g.name}</div>
              <div className="emoji-grid">
                {g.entries.map((e) => (
                  <button
                    key={e.emoji}
                    className="emoji-cell"
                    title={e.name}
                    onClick={() => onSelect(e.emoji)}
                  >
                    {e.emoji}
                  </button>
                ))}
              </div>
            </React.Fragment>
          ))
        ) : filtered.length > 0 ? (
          <div className="emoji-grid" style={{ paddingTop: 10 }}>
            {filtered.map((e) => (
              <button
                key={e.emoji}
                className="emoji-cell"
                title={e.name}
                onClick={() => onSelect(e.emoji)}
              >
                {e.emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className="picker-status">No emoji found</div>
        )}
      </div>
    </div>
  )
}
