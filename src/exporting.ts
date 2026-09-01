import { toSvg } from 'html-to-image'
import { CanvasElement, DocState } from './types'
import { migrateDoc } from './state'

export function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function safeName(name: string): string {
  return (name.trim() || 'untitled').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase()
}

/**
 * Render the region of the world covered by `frame` to a PNG data URL.
 * Captures the live world element re-transformed so the frame fills the canvas.
 *
 * Uses toSvg + a manual Image/canvas rasterization instead of toPng:
 * html-to-image's own rasterizer waits on img.decode(), which can stall
 * indefinitely for foreignObject SVGs in Chromium.
 */
export async function captureFrame(worldEl: HTMLElement, frame: CanvasElement, scale = 2): Promise<string> {
  const svgUrl = await toSvg(worldEl, {
    width: frame.w * scale,
    height: frame.h * scale,
    backgroundColor: '#fbfbfa',
    style: {
      transform: `scale(${scale}) translate(${-frame.x}px, ${-frame.y}px)`,
      transformOrigin: '0 0',
    },
    filter: (node) => {
      const cls = (node as HTMLElement).classList
      if (!cls) return true
      return !cls.contains('marquee') && !cls.contains('endpoint-dot') && !cls.contains('frame-title')
    },
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const timeout = setTimeout(() => reject(new Error('render timed out')), 30000)
    image.onload = () => {
      clearTimeout(timeout)
      resolve(image)
    }
    image.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('could not rasterize the frame'))
    }
    image.src = svgUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = frame.w * scale
  canvas.height = frame.h * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.fillStyle = '#fbfbfa'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export async function exportFramePng(worldEl: HTMLElement, frame: CanvasElement) {
  const dataUrl = await captureFrame(worldEl, frame)
  download(dataUrl, `${safeName(frame.text || 'frame')}.png`)
}

export async function exportFramePdf(worldEl: HTMLElement, frame: CanvasElement) {
  const dataUrl = await captureFrame(worldEl, frame)
  const { jsPDF } = await import('jspdf')
  const landscape = frame.w >= frame.h
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'px',
    format: [frame.w, frame.h],
  })
  pdf.addImage(dataUrl, 'PNG', 0, 0, frame.w, frame.h)
  pdf.save(`${safeName(frame.text || 'frame')}.pdf`)
}

/* ---------- board files ---------- */

export interface BoardFile {
  app: 'goya'
  version: 1
  name: string
  doc: DocState
}

export function exportBoardFile(name: string, doc: DocState) {
  const payload: BoardFile = { app: 'goya', version: 1, name, doc }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  download(url, `${safeName(name)}.goya.json`)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function parseBoardFile(text: string): { name: string; doc: DocState } {
  const parsed = JSON.parse(text)
  // accept both wrapped board files and bare {elements, connectors} docs
  const doc = parsed.app === 'goya' ? parsed.doc : parsed
  if (!doc || !Array.isArray(doc.elements) || !Array.isArray(doc.connectors)) {
    throw new Error('Not a Goya board file')
  }
  return {
    name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'Imported board',
    doc: migrateDoc(doc),
  }
}

/* ---------- shared asset helpers ---------- */

/**
 * Images have to travel inside an export file: neither Figma nor Visio will
 * fetch a remote href. Uploads are already data URLs; searched images
 * (Openverse/Wikimedia) need a fetch, which can fail on CORS — callers report
 * those rather than silently dropping the element.
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

/**
 * Lucide ships icons as React components, so the only way to their path data
 * is to render one. react-dom/server is imported dynamically so it stays out
 * of the main bundle — it only loads when a board actually contains an icon.
 */
export async function iconPaths(name: string): Promise<string> {
  const { icons } = await import('lucide-react')
  const { createElement } = await import('react')
  const Icon = (icons as Record<string, any>)[name] ?? icons.Star
  const { renderToStaticMarkup } = await import('react-dom/server')
  const markup = renderToStaticMarkup(createElement(Icon, { width: 24, height: 24, strokeWidth: 1.6 }))
  // keep the children, drop lucide's own <svg> wrapper
  return markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}
