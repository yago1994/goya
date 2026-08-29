import React from 'react'
import { CanvasElement, Connector, ConnectorStyle, Side } from '../types'
import { anchorAt, connectorGeometry, curve, nearestAnchor } from '../geometry'

export interface TempConnector {
  /** element the fixed end stays attached to */
  fixedId: string
  /** pinned side of the fixed end, if any */
  fixedSide?: Side
  freeWorld: { x: number; y: number }
  targetId: string | null
  /** port on the target being aimed at; undefined = let geometry choose */
  targetSide?: Side
  /** when re-assigning an end of an existing connector, hide that connector */
  reconnectingId?: string
  /** direction: is the free end the arrow (to) end? */
  freeIsTo: boolean
}

interface Props {
  elements: CanvasElement[]
  connectors: Connector[]
  selectedConnector: string | null
  temp: TempConnector | null
  onConnectorPointerDown: (e: React.PointerEvent, id: string) => void
  onConnectorDoubleClick: (id: string) => void
}

function dashFor(style: ConnectorStyle | undefined): string | undefined {
  if (style === 'dashed') return '8 6'
  if (style === 'dotted') return '2 5'
  return undefined
}

export function ConnectorLayer({
  elements,
  connectors,
  selectedConnector,
  temp,
  onConnectorPointerDown,
  onConnectorDoubleClick,
}: Props) {
  const byId = new Map(elements.map((e) => [e.id, e]))

  let tempGeo: ReturnType<typeof curve> | null = null
  if (temp) {
    const fixed = byId.get(temp.fixedId)
    if (fixed) {
      const target = temp.targetId ? byId.get(temp.targetId) : null
      if (target) {
        // pin to the port being aimed at; otherwise leave it undefined so the
        // curve lands on the side facing the other end. Same side the drop
        // commits to, so the preview never lies.
        tempGeo = temp.freeIsTo
          ? connectorGeometry(fixed, target, temp.fixedSide, temp.targetSide)
          : connectorGeometry(target, fixed, temp.targetSide, temp.fixedSide)
      } else {
        const a = temp.fixedSide ? anchorAt(fixed, temp.fixedSide) : nearestAnchor(fixed, temp.freeWorld)
        const b = { x: temp.freeWorld.x, y: temp.freeWorld.y, nx: -a.nx, ny: -a.ny }
        tempGeo = temp.freeIsTo ? curve(a, b) : curve(b, a)
      }
    }
  }

  // Size the svg to the connectors' bounding box (plus padding) instead of
  // relying on overflow from a 1x1 element — overflow doesn't survive
  // serialization when a frame is exported to an image.
  const geos: { c: Connector; d: string }[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (pt: { x: number; y: number }) => {
    minX = Math.min(minX, pt.x)
    minY = Math.min(minY, pt.y)
    maxX = Math.max(maxX, pt.x)
    maxY = Math.max(maxY, pt.y)
  }
  for (const c of connectors) {
    if (temp?.reconnectingId === c.id) continue
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    if (!from || !to) continue
    const geo = connectorGeometry(from, to, c.fromSide, c.toSide, c.bend ?? 0)
    geos.push({ c, d: geo.d })
    grow(geo.start)
    grow(geo.end)
    grow(geo.c1)
    grow(geo.c2)
  }
  if (tempGeo) {
    grow(tempGeo.start)
    grow(tempGeo.end)
    grow(tempGeo.c1)
    grow(tempGeo.c2)
  }
  if (geos.length === 0 && !tempGeo) return null
  const PAD = 160
  const bx = minX - PAD
  const by = minY - PAD
  const bw = maxX - minX + PAD * 2
  const bh = maxY - minY + PAD * 2

  return (
    <svg
      className="connector-svg"
      style={{ left: bx, top: by }}
      width={bw}
      height={bh}
      viewBox={`${bx} ${by} ${bw} ${bh}`}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#b7b5b0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <marker id="arrow-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#2f6fed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {geos.map(({ c, d }) => {
        const selected = selectedConnector === c.id
        return (
          <g key={c.id}>
            <path
              className="connector-hit"
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              onPointerDown={(e) => {
                e.stopPropagation()
                onConnectorPointerDown(e, c.id)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onConnectorDoubleClick(c.id)
              }}
            />
            <path
              className={`connector-path${selected ? ' selected' : ''}`}
              d={d}
              fill="none"
              stroke={selected ? '#2f6fed' : '#b7b5b0'}
              strokeWidth={2}
              strokeDasharray={dashFor(c.style)}
              markerEnd={selected ? 'url(#arrow-sel)' : 'url(#arrow)'}
            />
          </g>
        )
      })}
      {tempGeo && (
        <path
          className="connector-path"
          d={tempGeo.d}
          fill="none"
          stroke="#b7b5b0"
          strokeWidth={2}
          strokeDasharray="6 5"
          markerEnd="url(#arrow)"
        />
      )}
    </svg>
  )
}
