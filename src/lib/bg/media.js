const IMAGE_EXTENSIONS = new Set([
  'apng', 'avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'jfif', 'jif', 'jpe', 'jpeg', 'jpg',
  'png', 'svg', 'tif', 'tiff', 'webp',
])

export function isImageFile(file) {
  if (String(file?.type || '').toLowerCase().startsWith('image/')) return true
  const ext = String(file?.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase()
  return !!ext && IMAGE_EXTENSIONS.has(ext)
}
