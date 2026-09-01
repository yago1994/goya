import { CanvasElement, COLORS, DocState } from './types'
import { download, iconPaths, inlineImage, safeName } from './exporting'
import { makeZip, utf8, ZipEntry } from './vsdx/zip'
import {
  APP_XML,
  CONTENT_TYPES,
  CORE_XML,
  DOCUMENT_XML,
  DOC_RELS,
  MASTER1_XML,
  MASTERS_RELS,
  MASTERS_XML,
  PAGES_RELS,
  PAGES_XML,
  ROOT_RELS,
  WINDOWS_XML,
} from './vsdx/parts'
import { connectorXml, esc, inches, PageBox, shapeXml } from './vsdx/page'

/**
 * Board → .vsdx, the only file format Miro's diagram importer accepts.
 *
 * This writes the Visio package directly rather than routing through draw.io,
 * whose VSDX export turned out to be gated to its Atlassian build. The part
 * layout mirrors what draw.io emits, since that is the shape Miro's importer
 * is documented to handle.
 */

const MARGIN_PX = 40

/**
 * Visio has no vector-icon primitive that Miro's converter recognises, so a
 * lucide icon is rasterised and embedded like any other image. Drawn at 3x so
 * it still looks sharp when someone scales it up on the board.
 */
async function iconToPng(el: CanvasElement): Promise<string | null> {
  try {
    const c = COLORS[el.color ?? 'yellow'] ?? COLORS.yellow
    const inner = await iconPaths(el.icon ?? 'Star')
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ` +
      `fill="none" stroke="${c.text}" stroke-width="1.6" stroke-linecap="round" ` +
      `stroke-linejoin="round">${inner}</svg>`
    const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('icon render failed'))
      i.src = url
    })
    const scale = 3
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(el.w * scale))
    canvas.height = Math.max(1, Math.round(el.h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export interface VsdxExportResult {
  blob: Blob
  missingImages: string[]
  /** elements that have no Visio equivalent and were skipped */
  skipped: string[]
}

export async function boardToVsdx(name: string, doc: DocState): Promise<VsdxExportResult> {
  const { elements, connectors } = doc
  if (elements.length === 0) throw new Error('This board is empty.')

  // page bounds: the board's own extent plus a margin
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.w)
    maxY = Math.max(maxY, el.y + el.h)
  }
  const box: PageBox = {
    originX: minX - MARGIN_PX,
    originY: minY - MARGIN_PX,
    widthIn: inches(maxX - minX + MARGIN_PX * 2),
    heightIn: inches(maxY - minY + MARGIN_PX * 2),
  }

  const missingImages: string[] = []
  const skipped: string[] = []
  const ctx = { box, images: [] as { relId: string; ext: string; bytes: Uint8Array }[] }

  // Visio sheet ids must be unique across shapes and connectors on the page,
  // and connectors reference their endpoints by these ids
  const sheetId = new Map<string, number>()
  let nextId = 1
  const ordered = [
    ...elements.filter((e) => e.type === 'frame'),
    ...elements.filter((e) => e.type !== 'frame'),
  ]
  for (const el of ordered) sheetId.set(el.id, nextId++)

  const shapes: string[] = []
  for (const el of ordered) {
    let inlined: string | null = null
    if (el.type === 'image' && el.url) {
      inlined = await inlineImage(el.url)
      if (!inlined) missingImages.push(el.text || el.url)
    } else if (el.type === 'icon') {
      inlined = await iconToPng(el)
    }
    const xml = shapeXml(el, sheetId.get(el.id)!, ctx, inlined)
    if (xml) shapes.push(xml)
    else if (el.type !== 'text' && el.type !== 'heading') skipped.push(el.type)
  }

  const byId = new Map(elements.map((e) => [e.id, e]))
  const connects: string[] = []
  for (const c of connectors) {
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    if (!from || !to) continue
    const fromId = sheetId.get(c.from)!
    const toId = sheetId.get(c.to)!
    const id = nextId++
    shapes.push(connectorXml(c, id, from, to, fromId, toId, box))
    // the Connects table is what makes these real glued connections rather
    // than free-floating lines
    connects.push(
      `<Connect FromSheet="${id}" FromCell="BeginX" ToSheet="${fromId}"/>` +
        `<Connect FromSheet="${id}" FromCell="EndX" ToSheet="${toId}"/>`
    )
  }

  const page1 =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">` +
    `<Shapes>${shapes.join('')}</Shapes>` +
    (connects.length ? `<Connects>${connects.join('')}</Connects>` : '') +
    `</PageContents>`

  const pageRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="../masters/master1.xml"/>` +
    ctx.images
      .map(
        (img, i) =>
          `<Relationship Id="${img.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
          `Target="../media/image${i + 1}.${img.ext}"/>`
      )
      .join('') +
    `</Relationships>`

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES(ctx.images.map((i) => i.ext))) },
    { name: '_rels/.rels', data: utf8(ROOT_RELS) },
    { name: 'docProps/app.xml', data: utf8(APP_XML) },
    { name: 'docProps/core.xml', data: utf8(CORE_XML(esc(name || 'Board'))) },
    { name: 'visio/document.xml', data: utf8(DOCUMENT_XML) },
    { name: 'visio/_rels/document.xml.rels', data: utf8(DOC_RELS) },
    { name: 'visio/windows.xml', data: utf8(WINDOWS_XML) },
    { name: 'visio/masters/masters.xml', data: utf8(MASTERS_XML) },
    { name: 'visio/masters/master1.xml', data: utf8(MASTER1_XML) },
    { name: 'visio/masters/_rels/masters.xml.rels', data: utf8(MASTERS_RELS) },
    { name: 'visio/pages/pages.xml', data: utf8(PAGES_XML(box.widthIn, box.heightIn)) },
    { name: 'visio/pages/_rels/pages.xml.rels', data: utf8(PAGES_RELS) },
    { name: 'visio/pages/page1.xml', data: utf8(page1) },
    { name: 'visio/pages/_rels/page1.xml.rels', data: utf8(pageRels) },
    ...ctx.images.map((img, i) => ({
      name: `visio/media/image${i + 1}.${img.ext}`,
      data: img.bytes,
    })),
  ]

  return { blob: await makeZip(entries), missingImages, skipped }
}

export async function exportBoardVsdx(name: string, doc: DocState): Promise<VsdxExportResult> {
  const result = await boardToVsdx(name, doc)
  const url = URL.createObjectURL(result.blob)
  download(url, `${safeName(name)}.vsdx`)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return result
}

/** exported for the element-type check in the UI layer */
export type { CanvasElement }
