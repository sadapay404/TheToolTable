import { lazy } from 'react'

/* Every tool is its own chunk: the table opens instantly and a tool's code is fetched when first needed. */
const loaders = {
  MetadataExtractor: () => import('./tools/MetadataExtractor.jsx'),
  Converter: () => import('./tools/Converter.jsx'),
  Compressor: () => import('./tools/Compressor.jsx'),
  Clipper: () => import('./tools/Clipper.jsx'),
  ImageStudio: () => import('./tools/ImageStudio.jsx'),
  BgRemover: () => import('./tools/BgRemover.jsx'),
  FrameExtractor: () => import('./tools/FrameExtractor.jsx'),
  Visualizer: () => import('./tools/Visualizer.jsx'),
  UnitCurrency: () => import('./tools/UnitCurrency.jsx'),
  DecisionHub: () => import('./tools/DecisionHub.jsx'),
  QRStudio: () => import('./tools/QRStudio.jsx'),
  BackgroundStudio: () => import('./tools/BackgroundStudio.jsx'),
}
const lz = (k) => { const C = lazy(loaders[k]); C.preload = loaders[k]; return C }

export const TOOLS = [
  {
    id: 'metadata', n: 1, name: 'Metadata Extractor', icon: '🔍', color: '#C87941',
    tag: 'Image · Files',
    desc: 'Full EXIF / IPTC / XMP / GPS / ICC extraction with PDF reports and one-click Scrub & Sanitize.',
    keywords: 'exif iptc xmp gps metadata scrub sanitize clean privacy hex camera',
    comp: lz('MetadataExtractor'),
  },
  {
    id: 'converter', n: 2, name: 'Any-to-Any Converter', icon: '🔁', color: '#3E8ED0',
    tag: 'Convert',
    desc: 'Per-file batch conversion across image, video, audio, document & PDF formats with live progress.',
    keywords: 'convert png webp mp4 mkv wav flac gif jpg batch wasm ffmpeg',
    comp: lz('Converter'),
  },
  {
    id: 'compressor', n: 3, name: 'Target-Size Compressor', icon: '🎯', color: '#D04841',
    tag: 'Compress',
    desc: 'Hit an exact byte budget (25 MB for Discord/Email) with computed bitrates.',
    keywords: 'compress target size discord email bitrate crf ffmpeg reduce mb',
    comp: lz('Compressor'),
  },
  {
    id: 'clipper', n: 4, name: 'Media Clipper & Downloader', icon: '✂️', color: '#7B6CB0',
    tag: 'Download · Cut',
    desc: 'Paste any link — yt-dlp fetches it in the quality, format and time range you pick. Or clip a local file losslessly.',
    keywords: 'download yt-dlp youtube video audio mp3 clip trim cut waveform timeline url playlist section',
    comp: lz('Clipper'),
  },
  {
    id: 'imagestudio', n: 5, name: 'ImagePlayer Studio', icon: '🎨', color: '#E8A33D',
    tag: 'Image Edit',
    desc: 'GPU photo & video colour studio: 30+ looks, per-colour HSL mixer, 3-way grading, crop, straighten and export.',
    keywords: 'image photo video edit color colour grade hsl mixer hue saturation luminance brightness exposure temperature tint vibrance preset filter look lut crop rotate straighten flip resize vignette grain sharpen',
    comp: lz('ImageStudio'),
  },
  {
    id: 'bgremover', n: 6, name: 'AI Background Remover', icon: '🪄', color: '#2F9C95',
    tag: 'AI',
    desc: 'Offline (bundled) or Online (BiRefNet) AI cutouts. Refine brush, backgrounds, shadow, batch ZIP.',
    keywords: 'background remover birefnet online offline ai cutout transparent png mask erase hair isnet batch shadow blur',
    comp: lz('BgRemover'),
  },
  {
    id: 'frames', n: 7, name: 'Frame Extractor & Clipper', icon: '🎞️', color: '#B2675E',
    tag: 'Video',
    desc: 'Frame-by-frame stepping, hi-res snapshots, frame series, lossless trims & GIFs.',
    keywords: 'frame extractor snapshot gif webp video trim step fps clip',
    comp: lz('FrameExtractor'),
  },
  {
    id: 'visualizer', n: 8, name: 'Audio Visualizer Video', icon: '🎵', color: '#5F6CAF',
    tag: 'Audio · Video',
    desc: 'Turn MP3/WAV/FLAC into animated spectrum videos for any social ratio.',
    keywords: 'audio spectrum waveform visualizer video equalizer radial bars particles music',
    comp: lz('Visualizer'),
  },
  {
    id: 'units', n: 9, name: 'Currency, Unit & Time Converter', icon: '⚖️', color: '#4E937A',
    tag: 'Live · Offline-ready',
    desc: 'Fiat and crypto in every combination, 170+ units, and the time in all 195 countries.',
    keywords: 'currency exchange rate usd pkr eur inr btc bitcoin ethereum crypto coin unit length mass temperature speed bytes energy tola marla time timezone time zone world clock converter india pakistan offline',
    comp: lz('UnitCurrency'),
  },
  {
    id: 'decision', n: 10, name: 'Decision & Randomizer Hub', icon: '🎲', color: '#C3423F',
    tag: '3D · Fair random',
    desc: 'Coin, dice, wheel, bottle, name draw & teams, number generator and an oracle — all with fair crypto-grade randomness.',
    keywords: 'coin flip dice bottle spin wheel random decision picker raffle teams numbers lottery yes no magic 8 ball oracle truth dare party',
    comp: lz('DecisionHub'),
  },
  {
    id: 'qr', n: 11, name: 'QR Code Studio', icon: '🔳', color: '#1F7A8C',
    tag: 'Generate',
    desc: 'Design QR codes with 33 templates, 40 logos and a live scan check — plus a scanner, barcodes, bulk sheets and print cards.',
    keywords: 'qr code scanner reader decoder barcode ean upc code128 datamatrix wifi vcard upi link gradient logo svg png pdf bulk csv batch generator studio table tent business card poster',
    comp: lz('QRStudio'),
  },
  {
    id: 'backgrounds', n: 12, name: 'Background Canvas Studio', icon: '🌈', color: '#9D6BCE',
    tag: 'Design',
    desc: 'Wallpapers: mesh gradients, grain, presets & lossless 4K PNG export.',
    keywords: 'background wallpaper gradient mesh noise grain solid 4k avatar story canvas',
    comp: lz('BackgroundStudio'),
  },
]
