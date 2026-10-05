const VIDEO_EXTENSIONS = new Set(['3gp', 'avi', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'ogv', 'ts', 'vob', 'webm', 'wmv'])
const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jfif', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp'])

/** Resolve the files accepted by ImagePlayer Studio when a browser omits File.type. */
export function studioMediaKind(file) {
  const type = String(file?.type || '').toLowerCase()
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return null
  const ext = String(file?.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase()
  if (ext && VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (ext && IMAGE_EXTENSIONS.has(ext)) return 'image'
  return null
}
