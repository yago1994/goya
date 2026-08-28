export type ElementType =
  | 'sticky'
  | 'text'
  | 'heading'
  | 'icon'
  | 'emoji'
  | 'image'
  | 'rect'
  | 'ellipse'
  | 'frame'

export type TextAlign = 'left' | 'center' | 'right'

export interface CanvasElement {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  text?: string
  /** fill / accent color key from COLORS, or 'none' (shapes only) */
  color?: string
  /** shapes: border color key from COLORS, or 'none' */
  border?: string
  /** heading level 1–4 */
  level?: number
  /** explicit font size (text / heading); overrides the level default */
  fontSize?: number
  /** bold override; undefined = the type's default weight */
  bold?: boolean
  /** text alignment (text / heading) */
  align?: TextAlign
  /** lucide icon name (PascalCase) */
  icon?: string
  /** image url or data-url */
  url?: string
  /** attribution string for images */
  credit?: string
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

export type ConnectorStyle = 'solid' | 'dashed' | 'dotted'

export interface Connector {
  id: string
  from: string
  to: string
  /** explicit attachment sides; undefined = automatic (nearest) */
  fromSide?: Side
  toSide?: Side
  label?: string
  /** label position along the curve, 0..1 (default 0.5) */
  labelT?: number
  /** perpendicular curvature offset, dragged from the line itself */
  bend?: number
  style?: ConnectorStyle
}

export interface DocState {
  elements: CanvasElement[]
  connectors: Connector[]
  /** doc format version, bumped when saved fields change meaning */
  v?: number
}

export const DOC_VERSION = 2

export interface BoardMeta {
  id: string
  name: string
  updatedAt: number
}

export interface Viewport {
  x: number // screen-space pan offset
  y: number
  zoom: number
}

export const COLORS: Record<string, { fill: string; text: string; line: string; name: string }> = {
  yellow: { fill: '#FFF6C1', text: '#4D451A', line: '#D4B13F', name: 'Yellow' },
  peach: { fill: '#FFE3D3', text: '#59321D', line: '#E08D5B', name: 'Peach' },
  pink: { fill: '#FFDEEB', text: '#5C2440', line: '#DE6FA4', name: 'Pink' },
  purple: { fill: '#EBDFFC', text: '#3F2C63', line: '#9C79DB', name: 'Purple' },
  blue: { fill: '#D9EAFF', text: '#1B3A5C', line: '#5B8DEF', name: 'Blue' },
  teal: { fill: '#D2F4EC', text: '#154C41', line: '#3EBCA0', name: 'Teal' },
  green: { fill: '#DFF3D0', text: '#2E4A1B', line: '#7FB65B', name: 'Green' },
  gray: { fill: '#EFEFED', text: '#3F3F3C', line: '#96948F', name: 'Gray' },
}

export const HEADING_SIZES: Record<number, { size: number; weight: number; h: number }> = {
  1: { size: 68, weight: 700, h: 100 },
  2: { size: 48, weight: 700, h: 74 },
  3: { size: 34, weight: 600, h: 56 },
  4: { size: 24, weight: 600, h: 44 },
}

/** Discrete font sizes offered in the size dropdown */
export const FONT_SIZES = [12, 16, 24, 32, 48, 64]

export const DEFAULTS: Record<ElementType, { w: number; h: number }> = {
  sticky: { w: 200, h: 200 },
  text: { w: 260, h: 40 },
  heading: { w: 640, h: 100 },
  icon: { w: 64, h: 64 },
  emoji: { w: 64, h: 64 },
  image: { w: 320, h: 240 },
  rect: { w: 220, h: 130 },
  ellipse: { w: 200, h: 140 },
  frame: { w: 720, h: 480 },
}

export const EDITABLE_TYPES = ['sticky', 'text', 'heading', 'rect', 'ellipse']

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
