import React from 'react'
import { icons } from 'lucide-react'
import {
  CanvasElement,
  COLORS,
  Connector,
  DocState,
  ElementType,
  PEN_COLORS,
  PEN_STYLES,
} from './types'
import { connectorGeometry, pointAt } from './geometry'
import { strokePath, strokeWidthOf } from './drawing'
import { effectiveFontSize, effectiveWeight } from './components/ElementView'
import { download, safeName } from './exporting'

/**
 * Board → SVG, for pasting into Figma / FigJam.
 *
 * Figma turns pasted SVG into editable layers — one per node — so the goal
 * here is a *structural* export, not a picture: every element becomes its own
 * named <g>, shapes stay shapes, and text stays text. That is the opposite of
 * `captureFrame` in exporting.ts, which flattens the live DOM into a bitmap.
 *
 * Two constraints shape the whole file:
 *  - SVG has no auto-wrap, so every string has to be measured and broken into
 *    explicit <tspan> lines here (see `wrapText`).
 *  - Figma names a layer after the node's `id`, so ids are human-readable.
 */

const FONT = 'Inter, sans-serif'
const INK = '#37352f'
const INK_SOFT = '#787672'
const BG = '#fbfbfa'
/** connector stroke, matching .connector-path */
const LINE = '#b7b5b0'

const n = (v: number) => Math.round(v * 100) / 100

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Unique, readable, XML-safe layer name — Figma shows this in the layers panel. */
function layerId(label: string, used: Set<string>): string {
  const base =
    label
      .trim()
      .slice(0, 40)
      .replace(/[^\w\- ]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[^A-Za-z_]+/, '')
      .replace(/-+$/, '') || 'layer'
  let id = base
  let i = 2
  while (used.has(id)) id = `${base}-${i++}`
  used.add(id)
  return id
}

/* ---------- text measurement ---------- */

let measureCtx: CanvasRenderingContext2D | null = null
/** serial for clipPath ids, which only have to be unique within one document */
let clipSeq = 0

function fontOf(size: number, weight: number): string {
  return `${weight} ${size}px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
}

function measure(text: string, size: number, weight: number): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * size * 0.55 // no canvas: rough guess
  measureCtx.font = fontOf(size, weight)
  return measureCtx.measureText(text).width
}

/**
 * Break text the way the browser does inside a fixed-width box: wrap on spaces,
 * and hard-break a single word that is wider than the box (CSS word-break:
 * break-word). Explicit newlines are always kept.
 */
function wrapText(text: string, maxWidth: number, size: number, weight: number): string[] {
  const paras = text.split('\n')
  if (maxWidth <= 0) return paras
  const lines: string[] = []
  for (const para of paras) {
    if (!para) {
      lines.push('')
      continue
    }
    let line = ''
    for (const rawWord of para.split(' ')) {
      let word = rawWord
      // a word too long for the box: slice it until the remainder fits
      while (measure(word, size, weight) > maxWidth && word.length > 1) {
        let i = 1
        while (i < word.length && measure(word.slice(0, i + 1), size, weight) <= maxWidth) i++
        if (line) {
          lines.push(line)
          line = ''
        }
        lines.push(word.slice(0, i))
        word = word.slice(i)
      }
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate, size, weight) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  return lines
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface TextOpts {
  text: string
  box: Box
  size: number
  weight: number
  color: string
  align?: 'left' | 'center' | 'right'
  /** flex-start vs centered, matching the element's CSS */
  vAlign?: 'top' | 'center'
  lineHeight?: number
  letterSpacing?: number
  /**
   * Vertical window, in world units, that lines must fall inside — the
   * element's own box. Mirrors `overflow: hidden` on the element's .content:
   * a sticky with more text than it can hold shows a clipped block on the
   * canvas, so the export has to drop the same lines instead of spraying them
   * over its neighbours.
   */
  clipTo?: { top: number; bottom: number }
}

/** number of lines the last textSvg call dropped because they overflowed */
let lastClipped = 0

function textSvg(o: TextOpts): string {
  lastClipped = 0
  if (!o.text.trim()) return ''
  const align = o.align ?? 'left'
  const lh = o.size * (o.lineHeight ?? 1.4)
  const lines = wrapText(o.text, o.box.w, o.size, o.weight)
  const total = lines.length * lh
  const top = (o.vAlign ?? 'center') === 'center' ? o.box.y + (o.box.h - total) / 2 : o.box.y
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
  const tx =
    align === 'center' ? o.box.x + o.box.w / 2 : align === 'right' ? o.box.x + o.box.w : o.box.x
  // baseline sits a bit below the middle of each line box — 0.34em approximates
  // the cap-height offset well enough across the sizes this app uses
  const placed = lines.map((ln, i) => ({ ln, y: top + i * lh + lh / 2 + o.size * 0.34 }))
  const visible = o.clipTo
    ? placed.filter((l) => l.y - o.size >= o.clipTo!.top && l.y <= o.clipTo!.bottom)
    : placed
  lastClipped = placed.length - visible.length
  if (visible.length === 0) return ''
  const tspans = visible
    .map((l) => `<tspan x="${n(tx)}" y="${n(l.y)}">${esc(l.ln) || ' '}</tspan>`)
    .join('')
  const ls = o.letterSpacing ? ` letter-spacing="${n(o.letterSpacing)}"` : ''
  return (
    `<text font-family="${FONT}" font-size="${n(o.size)}" font-weight="${o.weight}" ` +
    `fill="${o.color}" text-anchor="${anchor}"${ls} xml:space="preserve">${tspans}</text>`
  )
}

/* ---------- images ---------- */

/**
 * Images have to travel inside the file: Figma won't fetch a remote href on
 * paste. Uploads are already data URLs; searched images (Openverse/Wikimedia)
 * need a fetch, which can fail on CORS — the caller reports those.
 */
export async function inlineImage(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/* ---------- icons ---------- */

/**
 * Lucide ships icons as React components, so the only way to their path data
 * is to render one. Pulled in dynamically so react-dom/server stays out of the
 * main bundle.
 */
export async function iconPaths(name: string): Promise<string> {
  const Icon = (icons as Record<string, any>)[name] ?? icons.Star
  const { renderToStaticMarkup } = await import('react-dom/server')
  const markup = renderToStaticMarkup(
    React.createElement(Icon, { width: 24, height: 24, strokeWidth: 1.6 })
  )
  // keep the children, drop lucide's own <svg> wrapper
  return markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}

/* ---------- elements ---------- */

/** Mirrors stackOrder/BEHIND_CONNECTORS in App.tsx so the export layers like the canvas. */
const BEHIND_CONNECTORS = new Set<ElementType>(['frame', 'rect', 'ellipse'])

function band(t: ElementType): number {
  return t === 'frame' ? 0 : BEHIND_CONNECTORS.has(t) ? 1 : 2
}

function stackOrder(elements: CanvasElement[]): CanvasElement[] {
  return elements
    .map((el, i) => ({ el, i }))
    .sort((a, b) => band(a.el.type) - band(b.el.type) || a.i - b.i)
    .map(({ el }) => el)
}

function fontColorOf(el: CanvasElement): string {
  if (el.color === 'black') return '#0f0f0f'
  if (el.color && el.color !== 'none' && COLORS[el.color]) return COLORS[el.color].line
  return INK
}

async function elementSvg(
  el: CanvasElement,
  used: Set<string>,
  warn: (m: string) => void,
  clipped: (m: string) => void
) {
  const name = (label: string) => layerId(label, used)
  const g = (id: string, body: string, extra = '') =>
    `<g id="${esc(id)}"${extra}>${body}</g>`

  switch (el.type) {
    case 'sticky': {
      const c = COLORS[el.color ?? 'yellow'] ?? COLORS.yellow
      const pad = 16
      const rect = `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" rx="4" fill="${c.fill}"/>`
      const text = textSvg({
        text: el.text ?? '',
        box: { x: el.x + pad, y: el.y + pad, w: el.w - pad * 2, h: el.h - pad * 2 },
        size: 16,
        weight: effectiveWeight(el),
        color: c.text,
        align: 'center',
        lineHeight: 1.4,
        clipTo: { top: el.y, bottom: el.y + el.h },
      })
      if (lastClipped > 0) clipped(el.text ?? '')
      return g(name(`Sticky ${el.text ?? ''}`), rect + text)
    }

    case 'rect':
    case 'ellipse': {
      const fillKey = el.color ?? 'blue'
      const fill = fillKey === 'none' ? 'none' : (COLORS[fillKey]?.fill ?? 'none')
      const textColor = fillKey === 'none' ? INK : (COLORS[fillKey]?.text ?? INK)
      const borderKey = el.border ?? 'none'
      let stroke = ''
      if (borderKey !== 'none') {
        stroke = ` stroke="${COLORS[borderKey]?.line ?? '#96948F'}" stroke-width="2"`
      } else if (fillKey === 'none') {
        // keep an invisible-fill shape findable, same as the canvas does
        stroke =
          ` stroke="${INK}" stroke-opacity="0.25" stroke-width="1.5" stroke-dasharray="5 4"`
      }
      const pad = el.type === 'rect' ? 14 : 20
      const shape =
        el.type === 'rect'
          ? `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" rx="10" fill="${fill}"${stroke}/>`
          : `<ellipse cx="${n(el.x + el.w / 2)}" cy="${n(el.y + el.h / 2)}" rx="${n(el.w / 2)}" ry="${n(el.h / 2)}" fill="${fill}"${stroke}/>`
      const text = textSvg({
        text: el.text ?? '',
        box: { x: el.x + pad, y: el.y + pad, w: el.w - pad * 2, h: el.h - pad * 2 },
        size: 15,
        weight: effectiveWeight(el),
        color: textColor,
        align: 'center',
        lineHeight: 1.4,
      })
      const label = el.type === 'rect' ? 'Rectangle' : 'Ellipse'
      return g(name(`${label} ${el.text ?? ''}`), shape + text)
    }

    case 'text':
    case 'heading': {
      const size = effectiveFontSize(el)
      const isHeading = el.type === 'heading'
      const text = textSvg({
        text: el.text ?? '',
        box: { x: el.x + 6, y: el.y + 4, w: el.w - 12, h: el.h - 8 },
        size,
        weight: effectiveWeight(el),
        color: fontColorOf(el),
        align: el.align ?? 'left',
        vAlign: 'top',
        lineHeight: isHeading ? 1.25 : 1.5,
        letterSpacing: isHeading ? size * -0.015 : 0,
      })
      if (!text) return ''
      return g(name(`${isHeading ? 'Heading' : 'Text'} ${el.text ?? ''}`), text)
    }

    case 'icon': {
      const c = COLORS[el.color ?? 'yellow'] ?? COLORS.yellow
      const inner = await iconPaths(el.icon ?? 'Star')
      const sx = el.w / 24
      const sy = el.h / 24
      const body =
        `<g transform="translate(${n(el.x)} ${n(el.y)}) scale(${n(sx)} ${n(sy)})" ` +
        `fill="none" stroke="${c.text}" stroke-width="1.6" stroke-linecap="round" ` +
        `stroke-linejoin="round">${inner}</g>`
      return g(name(`Icon ${el.icon ?? 'Star'}`), body)
    }

    case 'emoji': {
      const size = Math.min(el.w, el.h) * 0.8
      const body =
        `<text x="${n(el.x + el.w / 2)}" y="${n(el.y + el.h / 2 + size * 0.35)}" ` +
        `font-size="${n(size)}" text-anchor="middle" xml:space="preserve">${esc(el.text ?? '')}</text>`
      return g(name(`Emoji ${el.text ?? ''}`), body)
    }

    case 'image': {
      const href = el.url ? await inlineImage(el.url) : null
      if (!href) {
        warn(el.text || el.url || 'image')
        // leave a labelled placeholder rather than dropping the element
        const box = `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" rx="10" fill="#ececea"/>`
        const label = textSvg({
          text: el.text || 'Image unavailable',
          box: { x: el.x + 12, y: el.y + 12, w: el.w - 24, h: el.h - 24 },
          size: 13,
          weight: 500,
          color: INK_SOFT,
          align: 'center',
        })
        return g(name(`Image ${el.text ?? ''}`), box + label)
      }
      const clip = `clip-${clipSeq++}`
      const body =
        `<defs><clipPath id="${clip}"><rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" rx="10"/></clipPath></defs>` +
        `<image clip-path="url(#${clip})" x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" ` +
        `preserveAspectRatio="xMidYMid slice" href="${href}" xlink:href="${href}"/>`
      return g(name(`Image ${el.text ?? ''}`), body)
    }

    case 'draw': {
      const ink = PEN_COLORS[el.color ?? 'ink'] ?? PEN_COLORS.ink
      const style = PEN_STYLES[el.pen ?? 'pen']
      const d = strokePath(el.points ?? [], el.w, el.h)
      if (!d) return ''
      const blend = style.blend ? ` style="mix-blend-mode:${style.blend}"` : ''
      const body =
        `<path transform="translate(${n(el.x)} ${n(el.y)})" d="${d}" fill="none" ` +
        `stroke="${ink.stroke}" stroke-width="${n(strokeWidthOf(el))}" ` +
        `stroke-linecap="${style.cap}" stroke-linejoin="round" opacity="${style.opacity}"${blend}/>`
      return g(name(`Drawing ${style.name}`), body)
    }

    case 'frame': {
      const body =
        `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" rx="12" ` +
        `fill="#ffffff" fill-opacity="0.75" stroke="${INK}" stroke-opacity="0.14" stroke-width="1.5"/>`
      const title = el.text ?? ''
      let tab = ''
      if (title.trim()) {
        // the tab is nowrap and capped at the frame's width, so it never wraps
        // and never runs past the frame — same as the canvas
        const tw = Math.min(el.w, measure(title, 13, 600) + 20)
        const th = 24
        tab =
          `<rect x="${n(el.x)}" y="${n(el.y - 30)}" width="${n(tw)}" height="${th}" rx="7" ` +
          `fill="${BG}" stroke="${INK}" stroke-opacity="0.09" stroke-width="1"/>` +
          textSvg({
            text: title.replace(/\s*\n\s*/g, ' '),
            box: { x: el.x + 10, y: el.y - 30, w: Math.max(1, tw - 20), h: th },
            size: 13,
            weight: 600,
            color: INK_SOFT,
            align: 'left',
            clipTo: { top: el.y - 30, bottom: el.y - 6 },
          })
      }
      return g(name(`Frame ${title}`), body + tab)
    }
  }
  return ''
}

/* ---------- connectors ---------- */

function dashFor(style: Connector['style']): string {
  if (style === 'dashed') return ' stroke-dasharray="8 6"'
  if (style === 'dotted') return ' stroke-dasharray="2 5"'
  return ''
}

/**
 * The canvas draws arrowheads with an SVG <marker>. Markers don't survive the
 * trip into Figma as an editable shape, so the head is emitted as a real path
 * aimed down the curve's tangent at the end point. Sizes match the marker:
 * 7 marker units × 2px stroke, tip at the anchor (refX 8 of a 0–10 viewBox).
 */
function arrowHead(geo: ReturnType<typeof connectorGeometry>): string {
  const last = geo.segs[geo.segs.length - 1]
  const tip = last[3]
  let dx = tip.x - last[2].x
  let dy = tip.y - last[2].y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) {
    dx = tip.x - geo.start.x
    dy = tip.y - geo.start.y
  }
  const m = Math.max(1e-6, Math.hypot(dx, dy))
  const ux = dx / m
  const uy = dy / m
  const L = 11.2
  const H = 5.6
  const bx = tip.x - ux * L
  const by = tip.y - uy * L
  // perpendicular, for the two barbs
  const px = -uy * H
  const py = ux * H
  return (
    `<path d="M ${n(bx + px)} ${n(by + py)} L ${n(tip.x)} ${n(tip.y)} L ${n(bx - px)} ${n(by - py)}" ` +
    `fill="none" stroke="${LINE}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

function connectorSvg(
  c: Connector,
  geo: ReturnType<typeof connectorGeometry>,
  used: Set<string>
): string {
  const line =
    `<path d="${geo.d}" fill="none" stroke="${LINE}" stroke-width="2" ` +
    `stroke-linecap="round"${dashFor(c.style)}/>`
  return `<g id="${esc(layerId(`Connector ${c.label ?? ''}`, used))}">${line}${arrowHead(geo)}</g>`
}

function connectorLabelSvg(
  c: Connector,
  geo: ReturnType<typeof connectorGeometry>,
  used: Set<string>
): string {
  const label = c.label
  if (!label || !label.trim()) return ''
  const pos = pointAt(geo, c.labelT ?? 0.5)
  const maxContent = 240
  const lines = wrapText(label, maxContent, 13, 500)
  const contentW = Math.min(maxContent, Math.max(...lines.map((l) => measure(l, 13, 500))))
  const lh = 13 * 1.4
  const w = contentW + 16
  const h = lines.length * lh + 6
  const box: Box = { x: pos.x - w / 2, y: pos.y - h / 2, w, h }
  const rect = `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(w)}" height="${n(h)}" rx="6" fill="${BG}"/>`
  const text = textSvg({
    text: label,
    box: { x: box.x + 8, y: box.y + 3, w: contentW, h: h - 6 },
    size: 13,
    weight: 500,
    color: INK_SOFT,
    align: 'center',
    lineHeight: 1.4,
  })
  return `<g id="${esc(layerId(`Label ${label}`, used))}">${rect}${text}</g>`
}

/* ---------- board ---------- */

export interface SvgExportResult {
  svg: string
  /** images that could not be inlined (cross-origin), by name/url */
  missingImages: string[]
  /** elements whose text overflows their box and was cut, as the canvas cuts it */
  clippedText: string[]
}

export async function boardToSvg(doc: DocState): Promise<SvgExportResult> {
  const { elements, connectors } = doc
  if (elements.length === 0) throw new Error('This board is empty.')

  const byId = new Map(elements.map((e) => [e.id, e]))
  const geos: { c: Connector; geo: ReturnType<typeof connectorGeometry> }[] = []
  for (const c of connectors) {
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    if (!from || !to) continue
    geos.push({ c, geo: connectorGeometry(from, to, c.fromSide, c.toSide, c.bend ?? 0) })
  }

  // bounds over every element box, frame title tab, and connector control point
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const el of elements) {
    grow(el.x, el.type === 'frame' ? el.y - 34 : el.y)
    grow(el.x + el.w, el.y + el.h)
  }
  for (const { geo } of geos) for (const p of geo.points) grow(p.x, p.y)

  const PAD = 64
  const vx = minX - PAD
  const vy = minY - PAD
  const vw = maxX - minX + PAD * 2
  const vh = maxY - minY + PAD * 2

  clipSeq = 0
  const used = new Set<string>()
  const missingImages: string[] = []
  const warn = (m: string) => missingImages.push(m)
  const clippedText: string[] = []
  const clip = (m: string) => clippedText.push(m)

  const ordered = stackOrder(elements)
  const back = ordered.filter((e) => BEHIND_CONNECTORS.has(e.type))
  const front = ordered.filter((e) => !BEHIND_CONNECTORS.has(e.type))

  // same painting order as the canvas: frames and shapes, connectors, then
  // everything else, then the connector labels on top
  const parts: string[] = []
  for (const el of back) parts.push(await elementSvg(el, used, warn, clip))
  for (const { c, geo } of geos) parts.push(connectorSvg(c, geo, used))
  for (const el of front) parts.push(await elementSvg(el, used, warn, clip))
  for (const { c, geo } of geos) parts.push(connectorLabelSvg(c, geo, used))

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${n(vw)}" height="${n(vh)}" viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}">` +
    parts.filter(Boolean).join('') +
    `</svg>`

  return { svg, missingImages, clippedText }
}

/* ---------- entry points ---------- */

/** Download the board as an .svg file — drag it onto a FigJam or Figma canvas. */
export async function exportBoardSvgFile(name: string, doc: DocState): Promise<SvgExportResult> {
  const result = await boardToSvg(doc)
  const blob = new Blob([result.svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  download(url, `${safeName(name)}.svg`)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return result
}

/**
 * Put the SVG source on the clipboard. Figma and FigJam both turn pasted SVG
 * markup into editable layers, so this is the fastest way in — no file, no
 * import dialog. Written as text/plain: Figma sniffs the markup itself.
 */
export async function copyBoardSvg(doc: DocState): Promise<SvgExportResult> {
  const result = await boardToSvg(doc)
  try {
    await navigator.clipboard.writeText(result.svg)
  } catch {
    // the async clipboard needs a secure context and permission; fall back to
    // the old selection-based copy, which only needs the click we're inside of
    if (!legacyCopy(result.svg))
      throw new Error('Could not reach the clipboard — use Export SVG instead.')
  }
  return result
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  try {
    ta.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta.remove()
  }
}
