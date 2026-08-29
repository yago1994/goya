import { CanvasElement, PEN_STYLES, PenTool, newId } from './types'

export interface Point {
  x: number
  y: number
}

const round = (n: number, places: number) => {
  const k = 10 ** places
  return Math.round(n * k) / k
}

/**
 * Rendered stroke width in world px. `strokeWidth` is stored relative to the
 * box diagonal, so a drawing thickens and thins with the box when resized.
 */
export function strokeWidthOf(el: CanvasElement): number {
  return Math.max(0.4, (el.strokeWidth ?? 0.01) * Math.hypot(el.w, el.h))
}

/**
 * SVG path through `points`, smoothed with quadratic segments that pass
 * through the midpoint of each pair — cheap, and it takes the corners off a
 * raw pointer trail without shifting it.
 *
 * Points are normalized 0–1; pass the box size to map them into local pixels,
 * or w = h = 1 to draw a live stroke that is already in world coordinates.
 */
export function strokePath(points: number[], w: number, h: number): string {
  const n = points.length / 2
  if (n === 0) return ''
  const px = (i: number) => round(points[i * 2] * w, 2)
  const py = (i: number) => round(points[i * 2 + 1] * h, 2)
  // a tap: a hair of length so the round cap renders it as a dot
  if (n === 1) return `M ${px(0)} ${py(0)} l 0.01 0`
  if (n === 2) return `M ${px(0)} ${py(0)} L ${px(1)} ${py(1)}`
  let d = `M ${px(0)} ${py(0)}`
  for (let i = 1; i < n - 1; i++) {
    d += ` Q ${px(i)} ${py(i)} ${round((px(i) + px(i + 1)) / 2, 2)} ${round((py(i) + py(i + 1)) / 2, 2)}`
  }
  return `${d} L ${px(n - 1)} ${py(n - 1)}`
}

/**
 * Turn a finished pointer trail (flat world coordinates) into an element whose
 * box is the stroke's bounding box padded by half the stroke width, with the
 * points stored normalized inside it.
 */
export function strokeElement(
  world: number[],
  pen: PenTool,
  color: string,
  size: number
): CanvasElement | null {
  const n = world.length / 2
  if (n === 0) return null

  const width = size * PEN_STYLES[pen].width
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, world[i * 2])
    maxX = Math.max(maxX, world[i * 2])
    minY = Math.min(minY, world[i * 2 + 1])
    maxY = Math.max(maxY, world[i * 2 + 1])
  }

  const pad = width / 2 + 1
  const x = minX - pad
  const y = minY - pad
  const w = Math.max(maxX - minX + pad * 2, width + 2)
  const h = Math.max(maxY - minY + pad * 2, width + 2)

  const points: number[] = []
  for (let i = 0; i < n; i++) {
    points.push(round((world[i * 2] - x) / w, 4), round((world[i * 2 + 1] - y) / h, 4))
  }

  return {
    id: newId(),
    type: 'draw',
    x,
    y,
    w,
    h,
    points,
    pen,
    color,
    strokeWidth: width / Math.hypot(w, h),
  }
}

function distanceToSegment(p: Point, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len))
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy))
}

/** Does the eraser circle at `p` touch this drawing's ink (not just its box)? */
export function strokeNear(el: CanvasElement, p: Point, radius: number): boolean {
  const pts = el.points
  if (el.type !== 'draw' || !pts || pts.length === 0) return false
  const r = radius + strokeWidthOf(el) / 2
  if (p.x < el.x - r || p.x > el.x + el.w + r || p.y < el.y - r || p.y > el.y + el.h + r) return false

  const n = pts.length / 2
  const X = (i: number) => el.x + pts[i * 2] * el.w
  const Y = (i: number) => el.y + pts[i * 2 + 1] * el.h
  if (n === 1) return Math.hypot(p.x - X(0), p.y - Y(0)) <= r
  for (let i = 0; i < n - 1; i++) {
    if (distanceToSegment(p, X(i), Y(i), X(i + 1), Y(i + 1)) <= r) return true
  }
  return false
}
