/**
 * Read an image file and downscale it to a data URL.
 * Downscaling keeps localStorage autosave within its ~5MB quota.
 */
export function fileToDataUrl(
  file: File,
  maxDim = 1200
): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      // PNG for images with transparency, JPEG otherwise
      const isPng = file.type === 'image/png' || file.type === 'image/gif'
      const url = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85)
      resolve({ url, width: w, height: h })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('could not read image'))
    }
    img.src = objectUrl
  })
}
