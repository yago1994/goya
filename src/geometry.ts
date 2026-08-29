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

/**
 * Side of `el` a dragged connector end is deliberately aiming at: the port
 * within `tol` (world units) of the pointer, if any. Returns undefined when
 * the pointer is over the body rather than a port, so the caller can let the
 * geometry pick the side that faces the other end instead of overshooting to
 * a far-side anchor.
 */
export function aimedSide(el: CanvasElement, pt: { x: number; y: number }, tol: number): Side | undefined {
  let best: Side | undefined
  let bestDist = tol
  for (const s of SIDES) {
    const a = anchorAt(el, s)
    const d = Math.hypot(a.x - pt.x, a.y - pt.y)
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

export interface Point {
  x: number
  y: number
}

/** One cubic bezier: [start, control 1, control 2, end]. */
type Seg = [Point, Point, Point, Point]

export interface CurveGeometry {
  d: string
  start: Point
  end: Point
  mid: Point
  /** endpoints + control points, for bounding the path */
  points: Point[]
  /** unit perpendicular of the straight start→end line (bend direction) */
  normal: Point
  /** cubic segments the path is built from */
  segs: Seg[]
}

function evalSeg(s: Seg, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x,
    y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y,
  }
}

export function curve(p: Anchor, q: Anchor, bend = 0): CurveGeometry {
  const dist = Math.hypot(q.x - p.x, q.y - p.y)
  const len = Math.max(1e-6, dist)
  // unit perpendicular of the chord, used to bow the curve
  const nx = -(q.y - p.y) / len
  const ny = (q.x - p.x) / len

  let segs: Seg[]
  if (!bend) {
    const k = Math.min(120, Math.max(30, dist * 0.4))
    segs = [
      [
        { x: p.x, y: p.y },
        { x: p.x + p.nx * k, y: p.y + p.ny * k },
        { x: q.x + q.nx * k, y: q.y + q.ny * k },
        { x: q.x, y: q.y },
      ],
    ]
  } else {
    // Bow the middle without tilting the ends. Offsetting both control points
    // sideways (the old way) rotated the tangent at each anchor, so a bent
    // connector met the element — and drew its arrowhead — at a slant. Instead
    // the handles at each anchor stay on that side's normal, and the bend is
    // carried by an apex in the middle whose handles run along the chord.
    const apex = { x: (p.x + q.x) / 2 + nx * bend, y: (p.y + q.y) / 2 + ny * bend }
    const ux = (q.x - p.x) / len
    const uy = (q.y - p.y) / len
    const k = Math.min(90, Math.max(24, dist * 0.28))
    const h = Math.max(20, dist * 0.22)
    segs = [
      [
        { x: p.x, y: p.y },
        { x: p.x + p.nx * k, y: p.y + p.ny * k },
        { x: apex.x - ux * h, y: apex.y - uy * h },
        apex,
      ],
      [
        apex,
        { x: apex.x + ux * h, y: apex.y + uy * h },
        { x: q.x + q.nx * k, y: q.y + q.ny * k },
        { x: q.x, y: q.y },
      ],
    ]
  }

  const d = segs
    .map(
      (s, i) =>
        `${i === 0 ? `M ${s[0].x} ${s[0].y} ` : ''}C ${s[1].x} ${s[1].y}, ${s[2].x} ${s[2].y}, ${s[3].x} ${s[3].y}`
    )
    .join(' ')

  return {
    d,
    start: { x: p.x, y: p.y },
    end: { x: q.x, y: q.y },
    points: segs.flat(),
    normal: { x: nx, y: ny },
    segs,
    mid: segs.length === 1 ? evalSeg(segs[0], 0.5) : segs[0][3],
  }
}

/** Point on the curve at parameter t (0..1), split evenly across segments. */
export function pointAt(geo: CurveGeometry, t: number): Point {
  const n = geo.segs.length
  const i = Math.min(n - 1, Math.max(0, Math.floor(t * n)))
  return evalSeg(geo.segs[i], t * n - i)
}

/** Parameter t of the curve point nearest to `pt` (sampled). */
export function nearestT(geo: CurveGeometry, pt: Point): number {
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
