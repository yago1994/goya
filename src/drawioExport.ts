import { CanvasElement, COLORS, Connector, DocState, PEN_COLORS, PEN_STYLES, Side } from './types'
import { effectiveFontSize, effectiveWeight } from './components/ElementView'
import { download, safeName } from './exporting'
import { inlineImage, iconPaths } from './svgExport'

/**
 * Board → draw.io (.drawio) file, as the first leg of the route into Miro.
 *
 * Miro imports diagrams only as .vsdx, and the documented way to produce one
 * without Visio is draw.io's own "Export as > VSDX". So this writes mxGraph
 * XML — open, simple, and well documented — and lets draw.io's mature
 * exporter do the OOXML work. The user's path is:
 *
 *   Goya → .drawio → app.diagrams.net → Export as VSDX → Miro "Import diagram"
 *
 * Unlike the SVG exporter, nothing here measures or wraps text: draw.io has
 * real text layout (`whiteSpace=wrap`), so labels stay strings and the target
 * app reflows them. That sidesteps the whole class of overflow bugs.
 */

/** XML-escape, then turn newlines into <br> — rendered as breaks under html=1. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '&lt;br&gt;')
}

const n = (v: number) => Math.round(v * 100) / 100

/** Default text colour — the canvas's muted, fill-derived tints read poorly
 * once another tool re-renders them. See TEXT_BLACK in vsdx/page.ts. */
const TEXT_BLACK = '#000000'

/**
 * Style strings are ;-delimited, so a value can never contain a ';'.
 *
 * `bare` holds shape names, which mxGraph reads as valueless tokens at the
 * front of the string — `ellipse;...`, not `ellipse=1;...`. Writing them as
 * key=value silently yields a plain rectangle.
 */
function styleOf(
  parts: Record<string, string | number | undefined>,
  bare: string[] = []
): string {
  const kv = Object.entries(parts)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
  return [...bare, ...kv].join(';')
}

/** Goya's four attachment sides as mxGraph's relative exit/entry coordinates. */
const SIDE_XY: Record<Side, [number, number]> = {
  top: [0.5, 0],
  right: [1, 0.5],
  bottom: [0.5, 1],
  left: [0, 0.5],
}

function fontColorOf(el: CanvasElement): string {
  // an explicitly chosen font colour survives; everything else goes black
  if (el.color && el.color !== 'none' && el.color !== 'black' && COLORS[el.color]) {
    return COLORS[el.color].line
  }
  return TEXT_BLACK
}

function vertex(id: string, value: string, style: string, el: CanvasElement): string {
  return (
    `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="1">` +
    `<mxGeometry x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" as="geometry"/>` +
    `</mxCell>`
  )
}

/**
 * A data URL for a draw.io image style. draw.io strips the ";base64" marker
 * because ';' terminates a style entry — the shape reads `data:<mime>,<b64>`.
 */
function toStyleDataUrl(dataUrl: string): string | null {
  const m = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(dataUrl)
  if (!m) return null
  return `data:${m[1]},${m[2]}`
}

function svgToStyleDataUrl(svg: string): string {
  const b64 = btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml,${b64}`
}

async function elementCell(
  el: CanvasElement,
  id: string,
  warn: (m: string) => void
): Promise<string> {
  const bold = effectiveWeight(el) >= 700 ? 1 : undefined
  const text = esc(el.text ?? '')

  switch (el.type) {
    case 'sticky': {
      const c = COLORS[el.color ?? 'yellow'] ?? COLORS.yellow
      // A plain filled rectangle, not draw.io's `shape=note`: the note shape's
      // folded corner is custom geometry, which Miro imports as an arbitrary
      // editable shape rather than a sticky. A rectangle at least lands as a
      // clean Miro shape in the sticky's own colour.
      return vertex(
        id,
        text,
        styleOf({
          rounded: 0,
          whiteSpace: 'wrap',
          html: 1,
          fillColor: c.fill,
          strokeColor: 'none',
          fontColor: TEXT_BLACK,
          fontSize: 16,
          fontStyle: bold,
          align: 'center',
          verticalAlign: 'middle',
        }),
        el
      )
    }

    case 'rect':
    case 'ellipse': {
      const fillKey = el.color ?? 'blue'
      const fill = fillKey === 'none' ? 'none' : (COLORS[fillKey]?.fill ?? 'none')
      const borderKey = el.border ?? 'none'
      const stroke =
        borderKey === 'none'
          ? fillKey === 'none'
            ? '#BFBDB8'
            : 'none'
          : (COLORS[borderKey]?.line ?? '#96948F')
      return vertex(
        id,
        text,
        styleOf({
          perimeter: el.type === 'ellipse' ? 'ellipsePerimeter' : undefined,
          rounded: el.type === 'rect' ? 1 : undefined,
          whiteSpace: 'wrap',
          html: 1,
          fillColor: fill,
          strokeColor: stroke,
          dashed: borderKey === 'none' && fillKey === 'none' ? 1 : undefined,
          fontColor: TEXT_BLACK,
          fontSize: 15,
          fontStyle: bold,
          align: 'center',
          verticalAlign: 'middle',
        }, el.type === 'ellipse' ? ['ellipse'] : []),
        el
      )
    }

    case 'text':
    case 'heading':
      if (!(el.text ?? '').trim()) return ''
      return vertex(
        id,
        text,
        styleOf(
          {
            html: 1,
            whiteSpace: 'wrap',
            fillColor: 'none',
            strokeColor: 'none',
            fontColor: fontColorOf(el),
            fontSize: effectiveFontSize(el),
            fontStyle: bold,
            align: el.align ?? 'left',
            verticalAlign: 'top',
          },
          ['text']
        ),
        el
      )

    case 'emoji':
      return vertex(
        id,
        text,
        styleOf(
          {
            html: 1,
            fillColor: 'none',
            strokeColor: 'none',
            fontSize: Math.round(Math.min(el.w, el.h) * 0.8),
            align: 'center',
            verticalAlign: 'middle',
          },
          ['text']
        ),
        el
      )

    case 'icon': {
      const c = COLORS[el.color ?? 'yellow'] ?? COLORS.yellow
      const inner = await iconPaths(el.icon ?? 'Star')
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ` +
        `fill="none" stroke="${c.text}" stroke-width="1.6" stroke-linecap="round" ` +
        `stroke-linejoin="round">${inner}</svg>`
      return vertex(
        id,
        '',
        styleOf({ shape: 'image', html: 1, image: svgToStyleDataUrl(svg), imageAspect: 0 }),
        el
      )
    }

    case 'image': {
      const inlined = el.url ? await inlineImage(el.url) : null
      const styleUrl = inlined ? toStyleDataUrl(inlined) : null
      if (!styleUrl) {
        warn(el.text || el.url || 'image')
        return vertex(
          id,
          esc(el.text || 'Image unavailable'),
          styleOf({
            rounded: 1,
            whiteSpace: 'wrap',
            html: 1,
            fillColor: '#ECECEA',
            strokeColor: 'none',
            fontColor: '#787672',
            fontSize: 13,
          }),
          el
        )
      }
      return vertex(
        id,
        '',
        styleOf({ shape: 'image', html: 1, image: styleUrl, imageAspect: 0 }),
        el
      )
    }

    case 'frame':
      // A plain outlined rectangle titled at the top-left, rather than a
      // swimlane container: a swimlane would require reparenting every element
      // inside it onto frame-relative coordinates, and Miro maps frames to
      // "Frames and Shapes" either way.
      return vertex(
        id,
        text,
        styleOf({
          rounded: 1,
          whiteSpace: 'wrap',
          html: 1,
          fillColor: 'none',
          strokeColor: '#C9C7C2',
          fontColor: TEXT_BLACK,
          fontSize: 13,
          fontStyle: 1,
          align: 'left',
          verticalAlign: 'top',
          spacingLeft: 8,
          spacingTop: 4,
        }),
        el
      )
  }
  return ''
}

/* ---------- freehand ---------- */

/**
 * A stroke becomes an edge with waypoints and no endpoints — the closest thing
 * mxGraph has to ink, and it survives into Miro as a line rather than a raster.
 * Points are decimated: a raw pointer trail can hold hundreds, and Visio's
 * geometry gets unwieldy long before that.
 */
function strokeCell(el: CanvasElement, id: string): string {
  const pts = el.points ?? []
  const count = pts.length / 2
  if (count < 2) return ''
  const MAX = 60
  const step = Math.max(1, Math.ceil(count / MAX))
  const at = (i: number) => ({ x: el.x + pts[i * 2] * el.w, y: el.y + pts[i * 2 + 1] * el.h })

  const kept: { x: number; y: number }[] = []
  for (let i = 0; i < count; i += step) kept.push(at(i))
  if (kept.length < 2 || kept[kept.length - 1] !== at(count - 1)) kept.push(at(count - 1))

  const ink = PEN_COLORS[el.color ?? 'ink'] ?? PEN_COLORS.ink
  const pen = PEN_STYLES[el.pen ?? 'pen']
  const width = Math.max(1, Math.round((el.strokeWidth ?? 0.01) * Math.hypot(el.w, el.h)))
  const start = kept[0]
  const end = kept[kept.length - 1]
  const mid = kept.slice(1, -1)

  const style = styleOf({
    endArrow: 'none',
    html: 1,
    rounded: 1,
    curved: 1,
    strokeColor: ink.stroke,
    strokeWidth: width,
    opacity: Math.round(pen.opacity * 100),
  })

  return (
    `<mxCell id="${id}" style="${style}" edge="1" parent="1">` +
    `<mxGeometry relative="1" as="geometry">` +
    `<mxPoint x="${n(start.x)}" y="${n(start.y)}" as="sourcePoint"/>` +
    `<mxPoint x="${n(end.x)}" y="${n(end.y)}" as="targetPoint"/>` +
    (mid.length
      ? `<Array as="points">${mid.map((p) => `<mxPoint x="${n(p.x)}" y="${n(p.y)}"/>`).join('')}</Array>`
      : '') +
    `</mxGeometry></mxCell>`
  )
}

/* ---------- connectors ---------- */

function connectorCell(c: Connector, id: string, sourceId: string, targetId: string): string {
  const dash =
    c.style === 'dashed'
      ? { dashed: 1, dashPattern: '8 6' }
      : c.style === 'dotted'
        ? { dashed: 1, dashPattern: '1 4' }
        : {}

  // An unset side means "nearest" on the canvas; leaving exit/entry off lets
  // draw.io pick the side the same way, so both ends stay live.
  const exit = c.fromSide ? SIDE_XY[c.fromSide] : undefined
  const entry = c.toSide ? SIDE_XY[c.toSide] : undefined

  const style = styleOf({
    html: 1,
    rounded: 0,
    // Goya bows connectors with a bezier; mxGraph has no arbitrary curvature,
    // so a bent connector becomes a curved edge and a straight one stays straight
    curved: c.bend ? 1 : undefined,
    endArrow: 'classic',
    strokeColor: '#B7B5B0',
    strokeWidth: 2,
    exitX: exit?.[0],
    exitY: exit?.[1],
    exitDx: exit ? 0 : undefined,
    exitDy: exit ? 0 : undefined,
    entryX: entry?.[0],
    entryY: entry?.[1],
    entryDx: entry ? 0 : undefined,
    entryDy: entry ? 0 : undefined,
    ...dash,
  })

  const label = (c.label ?? '').trim()
  // edge-label geometry runs -1..1 along the edge, where 0 is the midpoint
  const t = (c.labelT ?? 0.5) * 2 - 1
  const labelCell = label
    ? `<mxCell id="${id}-label" value="${esc(label)}" style="edgeLabel;html=1;align=center;` +
      `verticalAlign=middle;fontSize=13;fontColor=${TEXT_BLACK};" vertex="1" connectable="0" parent="${id}">` +
      `<mxGeometry x="${n(t)}" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry>` +
      `</mxCell>`
    : ''

  return (
    `<mxCell id="${id}" style="${style}" edge="1" parent="1" ` +
    `source="${sourceId}" target="${targetId}">` +
    `<mxGeometry relative="1" as="geometry"/></mxCell>${labelCell}`
  )
}

/* ---------- document ---------- */

export interface DrawioExportResult {
  xml: string
  missingImages: string[]
}

export async function boardToDrawio(name: string, doc: DocState): Promise<DrawioExportResult> {
  const { elements, connectors } = doc
  if (elements.length === 0) throw new Error('This board is empty.')

  const missingImages: string[] = []
  // mxGraph ids must be stable and XML-safe; Goya's own ids already are, but
  // prefix them so they can never collide with the reserved "0" and "1" cells
  const cellId = (id: string) => `g-${id}`

  const cells: string[] = []
  // frames first so they sit behind everything, matching the canvas
  const ordered = [
    ...elements.filter((e) => e.type === 'frame'),
    ...elements.filter((e) => e.type !== 'frame'),
  ]
  for (const el of ordered) {
    if (el.type === 'draw') {
      cells.push(strokeCell(el, cellId(el.id)))
      continue
    }
    cells.push(await elementCell(el, cellId(el.id), (m) => missingImages.push(m)))
  }

  const byId = new Map(elements.map((e) => [e.id, e]))
  for (const c of connectors) {
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    if (!from || !to) continue
    // a stroke is an edge, and mxGraph can't anchor an edge to another edge
    if (from.type === 'draw' || to.type === 'draw') continue
    cells.push(connectorCell(c, cellId(c.id), cellId(c.from), cellId(c.to)))
  }

  const xml =
    `<mxfile host="goya" type="device">` +
    `<diagram name="${esc(name || 'Board')}" id="goya-board">` +
    `<mxGraphModel dx="1200" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" ` +
    `connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
    cells.filter(Boolean).join('') +
    `</root></mxGraphModel></diagram></mxfile>`

  return { xml, missingImages }
}

export async function exportBoardDrawio(name: string, doc: DocState): Promise<DrawioExportResult> {
  const result = await boardToDrawio(name, doc)
  const blob = new Blob([result.xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  download(url, `${safeName(name)}.drawio`)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return result
}
