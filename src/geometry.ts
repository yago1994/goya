import { CanvasElement, Side } from './types'

export interface Anchor {
  x: number
  y: number
  nx: number // outward normal
  ny: number
}

export function anchorAt(el: CanvasElement, side: Side): Anchor {
  switch (side) {
    case 'top':
      return { x: el.x + el.w / 2, y: el.y, nx: 0, ny: -1 }
    case 'right':
      return { x: el.x + el.w, y: el.y + el.h / 2, nx: 1, ny: 0 }
    case 'bottom':
      return { x: el.x + el.w / 2, y: el.y + el.h, nx: 0, ny: 1 }
    case 'left':
      return { x: el.x, y: el.y + el.h / 2, nx: -1, ny: 0 }
  }
}

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

export function anchors(el: CanvasElement): Anchor[] {
  return SIDES.map((s) => anchorAt(el, s))
}

/** Side of `el` whose anchor is nearest to a point. */
export function nearestSide(el: CanvasElement, pt: { x: number; y: number }): Side {
  let best: Side = 'right'
  let bestDist = Infinity
  for (const s of SIDES) {
    const a = anchorAt(el, s)
    const d = (a.x - pt.x) ** 2 + (a.y - pt.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  return best
}

/** Anchor on `el` nearest to a free point, for temp connectors. */
export function nearestAnchor(el: CanvasElement, pt: { x: number; y: number }): Anchor {
  return anchorAt(el, nearestSide(el, pt))
}

/** Pick the pair of anchor points (one per element) with the shortest distance. */
function bestAnchors(a: CanvasElement, b: CanvasElement): [Anchor, Anchor] {
  const aa = anchors(a)
  const bb = anchors(b)
  let best: [Anchor, Anchor] = [aa[1], bb[3]]
  let bestDist = Infinity
  for (const p of aa) {
    for (const q of bb) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2
      if (d < bestDist) {
        bestDist = d
        best = [p, q]
      }
    }
  }
  return best
}

export interface CurveGeometry {
  d: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  mid: { x: number; y: number }
  /** cubic bezier control points (after bend) */
  c1: { x: number; y: number }
  c2: { x: number; y: number }
  /** unit perpendicular of the straight start→end line (bend direction) */
  normal: { x: number; y: number }
}

export function curve(p: Anchor, q: Anchor, bend = 0): CurveGeometry {
  const dist = Math.hypot(q.x - p.x, q.y - p.y)
  const k = Math.min(120, Math.max(30, dist * 0.4))
  // unit perpendicular of the chord, used to bow the curve
  const len = Math.max(1e-6, dist)
  const nx = -(q.y - p.y) / len
  const ny = (q.x - p.x) / len
  const c1x = p.x + p.nx * k + nx * bend
  const c1y = p.y + p.ny * k + ny * bend
  const c2x = q.x + q.nx * k + nx * bend
  const c2y = q.y + q.ny * k + ny * bend
  return {
    d: `M ${p.x} ${p.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${q.x} ${q.y}`,
    start: { x: p.x, y: p.y },
    end: { x: q.x, y: q.y },
    c1: { x: c1x, y: c1y },
    c2: { x: c2x, y: c2y },
    normal: { x: nx, y: ny },
    // cubic bezier at t = 0.5
    mid: {
      x: (p.x + 3 * c1x + 3 * c2x + q.x) / 8,
      y: (p.y + 3 * c1y + 3 * c2y + q.y) / 8,
    },
  }
}

/** Point on the curve at parameter t (0..1). */
export function pointAt(geo: CurveGeometry, t: number): { x: number; y: number } {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * geo.start.x + b * geo.c1.x + c * geo.c2.x + d * geo.end.x,
    y: a * geo.start.y + b * geo.c1.y + c * geo.c2.y + d * geo.end.y,
  }
}

/** Parameter t of the curve point nearest to `pt` (sampled). */
export function nearestT(geo: CurveGeometry, pt: { x: number; y: number }): number {
  let best = 0.5
  let bestDist = Infinity
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    const p = pointAt(geo, t)
    const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best
}

/**
 * Connector geometry between two elements. Sides pin an end to a specific
 * edge; an unspecified end auto-picks its nearest side.
 */
export function connectorGeometry(
  from: CanvasElement,
  to: CanvasElement,
  fromSide?: Side,
  toSide?: Side,
  bend = 0
): CurveGeometry {
  let p: Anchor
  let q: Anchor
  if (fromSide && toSide) {
    p = anchorAt(from, fromSide)
    q = anchorAt(to, toSide)
  } else if (fromSide) {
    p = anchorAt(from, fromSide)
    q = nearestAnchor(to, p)
  } else if (toSide) {
    q = anchorAt(to, toSide)
    p = nearestAnchor(from, q)
  } else {
    ;[p, q] = bestAnchors(from, to)
  }
  return curve(p, q, bend)
}
