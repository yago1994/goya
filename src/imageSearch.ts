export interface ImageResult {
  id: string
  thumb: string
  full: string
  width: number
  height: number
  title: string
  credit: string
}

/**
 * Web image search with no API key required.
 * Primary: Openverse (CC-licensed images, CORS-enabled public API).
 * Fallback: Wikimedia Commons (origin=* enables CORS).
 */
export async function searchImages(query: string): Promise<ImageResult[]> {
  try {
    const results = await searchOpenverse(query)
    if (results.length > 0) return results
  } catch {
    // fall through to Wikimedia
  }
  return searchWikimedia(query)
}

async function searchOpenverse(query: string): Promise<ImageResult[]> {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=24&mature=false`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`openverse ${res.status}`)
  const data = await res.json()
  return (data.results ?? [])
    .filter((r: any) => r.url)
    .map((r: any) => ({
      id: `ov-${r.id}`,
      thumb: r.thumbnail || r.url,
      full: r.url,
      width: r.width || 640,
      height: r.height || 480,
      title: r.title || '',
      credit: r.creator ? `${r.creator} · ${r.license?.toUpperCase() ?? ''}` : (r.source ?? ''),
    }))
}

async function searchWikimedia(query: string): Promise<ImageResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '480',
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
  if (!res.ok) throw new Error(`wikimedia ${res.status}`)
  const data = await res.json()
  const pages = data?.query?.pages ?? {}
  return Object.values(pages)
    .map((p: any) => {
      const info = p.imageinfo?.[0]
      if (!info) return null
      return {
        id: `wm-${p.pageid}`,
        thumb: info.thumburl || info.url,
        full: info.url,
        width: info.width || 640,
        height: info.height || 480,
        title: (p.title || '').replace(/^File:/, ''),
        credit: 'Wikimedia Commons',
      }
    })
    .filter(Boolean) as ImageResult[]
}
