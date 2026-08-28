import React, { useRef, useState } from 'react'
import { Check, Download, FilePlus2, Pencil, Trash2, Upload } from 'lucide-react'
import { BoardMeta } from '../types'

interface Props {
  boards: BoardMeta[]
  activeId: string
  onSwitch: (id: string) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onExportFile: () => void
  onImportFile: (file: File) => void
  onClose: () => void
}

export function BoardsPanel({
  boards,
  activeId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onExportFile,
  onImportFile,
  onClose,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const commitRename = () => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  const sorted = [...boards].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="boards-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="boards-list">
        {sorted.map((b) => (
          <div key={b.id} className={`board-row${b.id === activeId ? ' active' : ''}`}>
            {renamingId === b.id ? (
              <>
                <input
                  className="board-rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={commitRename}
                />
                <button className="row-btn" title="Save name" onClick={commitRename}>
                  <Check size={14} />
                </button>
              </>
            ) : (
              <>
                <button className="board-name" onClick={() => onSwitch(b.id)}>
                  {b.name}
                </button>
                <button
                  className="row-btn"
                  title="Rename"
                  onClick={() => {
                    setRenamingId(b.id)
                    setRenameValue(b.name)
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="row-btn"
                  title="Delete board"
                  onClick={() => {
                    if (window.confirm(`Delete board “${b.name}”? This can't be undone.`)) onDelete(b.id)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="boards-actions">
        <button className="boards-action" onClick={onCreate}>
          <FilePlus2 size={14} />
          New board
        </button>
        <button className="boards-action" title="Download this board as a file" onClick={onExportFile}>
          <Download size={14} />
          Export file
        </button>
        <button className="boards-action" title="Import a board file" onClick={() => fileRef.current?.click()}>
          <Upload size={14} />
          Import file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0]
            if (f) onImportFile(f)
            e.currentTarget.value = ''
            onClose()
          }}
        />
      </div>
    </div>
  )
}
