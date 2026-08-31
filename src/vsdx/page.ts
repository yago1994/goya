import { CanvasElement, COLORS, Connector, PEN_COLORS, PEN_STYLES } from '../types'
import { anchorAt, connectorGeometry } from '../geometry'
import { effectiveFontSize, effectiveWeight } from '../components/ElementView'

/**
 * Board → Visio page XML.
 *
 * Two coordinate conversions run through everything here:
 *  - Visio measures in inches. draw.io's own exporter treats 1px as 1/101.6in
 *    (100px = 25mm), and matching that keeps imported boards the same size as
 *    ones that came through draw.io.
 *  - Visio's origin is bottom-left with y increasing upward, so every y is
 *    flipped against the page height.
 *
 * A shape's PinX/PinY is its *centre*, not its corner, and geometry rows are
 * in shape-local coordinates that also run bottom-up.
 */

export const PX_PER_IN = 101.6
export const inches = (px: number) => px / PX_PER_IN

const n = (v: number) => Math.round(v * 1e6) / 1e6

/**
 * Text colour for everything the user did not explicitly colour.
 *
 * On the canvas, sticky and shape text takes a muted tint derived from the
 * fill (a yellow sticky writes in #4D451A), which reads well against Goya's
 * pastels but comes out washed-out and hard to read once Miro re-renders it.
 * Black survives the trip.
 */
const TEXT_BLACK = '#000000'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface PageBox {
  /** world px of the page's left/top edge — everything is shifted by this */
  originX: number
  originY: number
  widthIn: number
  heightIn: number
}

interface Ctx {
  box: PageBox
  /** image part relationships collected while emitting shapes */
  images: { relId: string; ext: string; bytes: Uint8Array }[]
}

/** Shape centre, converted into Visio page coordinates. */
function pin(el: { x: number; y: number; w: number; h: number }, box: PageBox) {
  const cx = inches(el.x + el.w / 2 - box.originX)
  const cy = inches(el.y + el.h / 2 - box.originY)
  return { pinX: n(cx), pinY: n(box.heightIn - cy) }
}

function point(x: number, y: number, box: PageBox) {
  return { x: n(inches(x - box.originX)), y: n(box.heightIn - inches(y - box.originY)) }
}

/** Common PinX/PinY/Width/Height/LocPin block. */
function frameCells(el: CanvasElement, box: PageBox): string {
  const { pinX, pinY } = pin(el, box)
  const w = inches(el.w)
  const h = inches(el.h)
  return (
    `<Cell N="PinX" V="${pinX}"/><Cell N="PinY" V="${pinY}"/>` +
    `<Cell N="Width" V="${n(w)}"/><Cell N="Height" V="${n(h)}"/>` +
    `<Cell N="LocPinX" V="${n(w / 2)}"/><Cell N="LocPinY" V="${n(h / 2)}"/>` +
    `<Cell N="LayerMember" V="0"/>`
  )
}

/** Character + Paragraph sections and the text run itself. */
function textBlock(
  text: string,
  opts: { size: number; color: string; bold?: boolean; align?: 'left' | 'center' | 'right'; vAlign?: 0 | 1 | 2 }
): string {
  if (!text.trim()) return ''
  const horz = opts.align === 'right' ? 2 : opts.align === 'center' ? 1 : 0
  return (
    `<Cell N="VerticalAlign" V="${opts.vAlign ?? 1}"/>` +
    `<Section N="Character"><Row IX="0">` +
    `<Cell N="Color" V="${opts.color}"/><Cell N="Size" V="${n(inches(opts.size))}"/>` +
    `<Cell N="Font" V="Arial"/><Cell N="Style" V="${opts.bold ? 1 : 0}"/>` +
    `</Row></Section>` +
    `<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="${horz}"/></Row></Section>` +
    `<Text>${esc(text)}</Text>`
  )
}

/** Rectangular outline in shape-local coordinates (origin bottom-left). */
function rectGeometry(el: CanvasElement, noFill: boolean, noLine: boolean): string {
  const w = n(inches(el.w))
  const h = n(inches(el.h))
  return (
    `<Section N="Geometry" IX="0">` +
    `<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
    `<Row T="LineTo" IX="2"><Cell N="X" V="${w}"/><Cell N="Y" V="0"/></Row>` +
    `<Row T="LineTo" IX="3"><Cell N="X" V="${w}"/><Cell N="Y" V="${h}"/></Row>` +
    `<Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="${h}"/></Row>` +
    `<Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
    `<Cell N="NoFill" V="${noFill ? 1 : 0}"/><Cell N="NoLine" V="${noLine ? 1 : 0}"/>` +
    `</Section>`
  )
}

function ellipseGeometry(el: CanvasElement, noLine: boolean): string {
  const w = inches(el.w)
  const h = inches(el.h)
  return (
    `<Section N="Geometry" IX="0"><Row T="Ellipse" IX="1">` +
    `<Cell N="X" V="${n(w / 2)}"/><Cell N="Y" V="${n(h / 2)}"/>` +
    `<Cell N="A" V="0"/><Cell N="B" V="${n(h / 2)}"/>` +
    `<Cell N="C" V="${n(w / 2)}"/><Cell N="D" V="${n(h)}"/>` +
    `</Row><Cell N="NoFill" V="0"/><Cell N="NoLine" V="${noLine ? 1 : 0}"/></Section>`
  )
}

function dataUrlToBytes(url: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:image\/(png|jpeg|jpg|gif);base64,(.*)$/s.exec(url)
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, ext: m[1] === 'jpeg' ? 'jpg' : m[1] }
}

export function shapeXml(
  el: CanvasElement,
  id: number,
  ctx: Ctx,
  inlinedUrl: string | null
): string {
  const head = (extra = '') =>
    `<Shape ID="${id}" NameU="Shape${id}" LineStyle="0" FillStyle="0" TextStyle="0" Type="Shape"${extra}>`
  const bold = effectiveWeight(el) >= 700

  switch (el.type) {
    case 'sticky': {
      const c = COLORS[el.color ?? 'yellow'] ?? COLORS.yellow
      // Visio has no sticky primitive; the shape name is the only hint a VSDX
      // can carry, in case Miro's converter matches on it
      return (
        `<Shape ID="${id}" NameU="Sticky Note" Name="Sticky Note" LineStyle="0" FillStyle="0" TextStyle="0" Type="Shape">` +
        frameCells(el, ctx.box) +
        `<Cell N="FillForegnd" V="${c.fill}"/><Cell N="LinePattern" V="0"/>` +
        textBlock(el.text ?? '', { size: 16, color: TEXT_BLACK, bold, align: 'center' }) +
        rectGeometry(el, false, true) +
        `</Shape>`
      )
    }

    case 'rect':
    case 'ellipse': {
      const fillKey = el.color ?? 'blue'
      const hasFill = fillKey !== 'none' && !!COLORS[fillKey]
      const fill = hasFill ? COLORS[fillKey].fill : '#ffffff'
      const borderKey = el.border ?? 'none'
      const hasLine = borderKey !== 'none' && !!COLORS[borderKey]
      const lineCells = hasLine
        ? `<Cell N="LineColor" V="${COLORS[borderKey].line}"/><Cell N="LineWeight" V="0.02"/><Cell N="LinePattern" V="1"/>`
        : `<Cell N="LinePattern" V="${hasFill ? 0 : 2}"/><Cell N="LineColor" V="#96948f"/>`
      return (
        head() +
        frameCells(el, ctx.box) +
        `<Cell N="FillForegnd" V="${fill}"/>` +
        (hasFill ? '' : `<Cell N="FillPattern" V="0"/>`) +
        lineCells +
        textBlock(el.text ?? '', { size: 15, color: TEXT_BLACK, bold, align: 'center' }) +
        (el.type === 'ellipse'
          ? ellipseGeometry(el, !hasLine && hasFill)
          : rectGeometry(el, !hasFill, !hasLine && hasFill)) +
        `</Shape>`
      )
    }

    case 'text':
    case 'heading': {
      if (!(el.text ?? '').trim()) return ''
      // an explicitly chosen font colour is information, so it survives;
      // everything else defaults to black
      const color =
        el.color && el.color !== 'none' && el.color !== 'black' && COLORS[el.color]
          ? COLORS[el.color].line
          : TEXT_BLACK
      return (
        head() +
        frameCells(el, ctx.box) +
        `<Cell N="FillPattern" V="0"/><Cell N="LinePattern" V="0"/>` +
        textBlock(el.text ?? '', {
          size: effectiveFontSize(el),
          color,
          bold,
          align: el.align ?? 'left',
          vAlign: 0,
        }) +
        rectGeometry(el, true, true) +
        `</Shape>`
      )
    }

    case 'emoji':
      return (
        head() +
        frameCells(el, ctx.box) +
        `<Cell N="FillPattern" V="0"/><Cell N="LinePattern" V="0"/>` +
        textBlock(el.text ?? '', {
          size: Math.min(el.w, el.h) * 0.7,
          color: TEXT_BLACK,
          align: 'center',
        }) +
        rectGeometry(el, true, true) +
        `</Shape>`
      )

    case 'frame':
      return (
        head() +
        frameCells(el, ctx.box) +
        `<Cell N="FillPattern" V="0"/><Cell N="LineColor" V="#c9c7c2"/><Cell N="LineWeight" V="0.015"/>` +
        textBlock(el.text ?? '', { size: 13, color: TEXT_BLACK, bold: true, align: 'left', vAlign: 0 }) +
        rectGeometry(el, true, false) +
        `</Shape>`
      )

    case 'draw': {
      const pts = el.points ?? []
      const count = pts.length / 2
      if (count < 2) return ''
      const ink = PEN_COLORS[el.color ?? 'ink'] ?? PEN_COLORS.ink
      const pen = PEN_STYLES[el.pen ?? 'pen']
      const weight = Math.max(0.005, inches((el.strokeWidth ?? 0.01) * Math.hypot(el.w, el.h)))
      // decimate: a raw pointer trail can carry hundreds of points, and Visio
      // geometry gets unwieldy long before that
      const step = Math.max(1, Math.ceil(count / 80))
      const rows: string[] = []
      let ix = 1
      for (let i = 0; i < count; i += step) {
        const lx = n(inches(pts[i * 2] * el.w))
        // shape-local y runs bottom-up, so flip within the box
        const ly = n(inches((1 - pts[i * 2 + 1]) * el.h))
        rows.push(
          `<Row T="${ix === 1 ? 'MoveTo' : 'LineTo'}" IX="${ix}"><Cell N="X" V="${lx}"/><Cell N="Y" V="${ly}"/></Row>`
        )
        ix++
      }
      return (
        head() +
        frameCells(el, ctx.box) +
        `<Cell N="FillPattern" V="0"/><Cell N="LineColor" V="${ink.stroke}"/>` +
        `<Cell N="LineWeight" V="${n(weight)}"/><Cell N="LineCap" V="${pen.cap === 'round' ? 0 : 1}"/>` +
        `<Cell N="Rounding" V="0.02"/>` +
        `<Section N="Geometry" IX="0">${rows.join('')}` +
        `<Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>` +
        `</Shape>`
      )
    }

    case 'icon':
    case 'image': {
      const decoded = inlinedUrl ? dataUrlToBytes(inlinedUrl) : null
      if (!decoded) {
        // keep the slot rather than dropping the element
        return (
          head() +
          frameCells(el, ctx.box) +
          `<Cell N="FillForegnd" V="#ececea"/><Cell N="LinePattern" V="0"/>` +
          textBlock(el.type === 'icon' ? (el.icon ?? 'Icon') : el.text || 'Image unavailable', {
            size: 13,
            color: TEXT_BLACK,
            align: 'center',
          }) +
          rectGeometry(el, false, true) +
          `</Shape>`
        )
      }
      const relId = `rId${ctx.images.length + 2}` // rId1 is the master
      ctx.images.push({ relId, ext: decoded.ext, bytes: decoded.bytes })
      const w = inches(el.w)
      const h = inches(el.h)
      // shape mirrors what draw.io's own exporter emits for an embedded
      // bitmap: CompressionType names the encoding, and the empty Geometry
      // section is required alongside ForeignData
      const compression = decoded.ext === 'jpg' ? 'JPEG' : decoded.ext === 'gif' ? 'GIF' : 'PNG'
      return (
        `<Shape ID="${id}" NameU="Shape${id}" LineStyle="0" FillStyle="0" TextStyle="0" Type="Foreign">` +
        frameCells(el, ctx.box) +
        `<Cell N="FillForegnd" V="#ffffff"/><Cell N="LineColor" V="#ffffff"/><Cell N="LinePattern" V="0"/>` +
        `<Cell N="ImgOffsetX" V="0"/><Cell N="ImgOffsetY" V="0"/>` +
        `<Cell N="ImgWidth" V="${n(w)}"/><Cell N="ImgHeight" V="${n(h)}"/>` +
        `<Section N="Geometry" IX="0"/>` +
        `<ForeignData ForeignType="Bitmap" CompressionType="${compression}"><Rel r:id="${relId}"/></ForeignData>` +
        `</Shape>`
      )
    }
  }
  return ''
}

/** LinePattern codes: 1 solid, 2 dashed, 3 dotted. */
function patternFor(style: Connector['style']): number {
  return style === 'dashed' ? 2 : style === 'dotted' ? 3 : 1
}

export function connectorXml(
  c: Connector,
  id: number,
  from: CanvasElement,
  to: CanvasElement,
  fromId: number,
  toId: number,
  box: PageBox
): string {
  const geo = connectorGeometry(from, to, c.fromSide, c.toSide, c.bend ?? 0)
  const begin = point(geo.start.x, geo.start.y, box)
  const end = point(geo.end.x, geo.end.y, box)
  const w = end.x - begin.x
  const h = end.y - begin.y

  return (
    `<Shape ID="${id}" NameU="Dynamic connector.${id}" Name="Dynamic connector.${id}" Type="Shape" Master="4">` +
    `<Cell N="PinX" V="${n((begin.x + end.x) / 2)}"/><Cell N="PinY" V="${n((begin.y + end.y) / 2)}"/>` +
    `<Cell N="Width" V="${n(Math.abs(w) || 0.01)}"/><Cell N="Height" V="${n(Math.abs(h) || 0.01)}"/>` +
    `<Cell N="LocPinX" V="${n(Math.abs(w) / 2 || 0.005)}"/><Cell N="LocPinY" V="${n(Math.abs(h) / 2 || 0.005)}"/>` +
    // the WALKGLUE/XFTRIGGER formulas are what make Visio re-route the line
    // when either end moves, rather than leaving a line pinned in space
    `<Cell N="BeginX" V="${begin.x}" F="_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)"/>` +
    `<Cell N="BeginY" V="${begin.y}" F="_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)"/>` +
    `<Cell N="EndX" V="${end.x}" F="_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)"/>` +
    `<Cell N="EndY" V="${end.y}" F="_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)"/>` +
    `<Cell N="BegTrigger" V="2" F="_XFTRIGGER(Sheet.${fromId}!EventXFMod)"/>` +
    `<Cell N="EndTrigger" V="2" F="_XFTRIGGER(Sheet.${toId}!EventXFMod)"/>` +
    `<Cell N="ConFixedCode" V="6"/><Cell N="LayerMember" V="0"/><Cell N="FillPattern" V="0"/>` +
    `<Cell N="LineColor" V="#b7b5b0"/><Cell N="LineWeight" V="0.02"/>` +
    `<Cell N="LinePattern" V="${patternFor(c.style)}"/><Cell N="Rounding" V="0"/>` +
    `<Cell N="TextBkgnd" V="#ffffff"/>` +
    `<Cell N="BeginArrow" V="0"/><Cell N="EndArrow" V="5"/><Cell N="EndArrowSize" V="2"/>` +
    textBlock(c.label ?? '', { size: 13, color: TEXT_BLACK, align: 'center' }) +
    `<Section N="Geometry" IX="0">` +
    `<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
    `<Row T="LineTo" IX="2"><Cell N="X" V="${n(w)}"/><Cell N="Y" V="${n(h)}"/></Row>` +
    `<Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/></Section>` +
    `</Shape>`
  )
}

export { esc, n, anchorAt }
export type { Ctx }
