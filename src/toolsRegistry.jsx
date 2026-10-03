import MetadataExtractor from './tools/MetadataExtractor.jsx'
import Converter from './tools/Converter.jsx'
import Compressor from './tools/Compressor.jsx'
import Clipper from './tools/Clipper.jsx'
import ImageStudio from './tools/ImageStudio.jsx'
import BgRemover from './tools/BgRemover.jsx'
import FrameExtractor from './tools/FrameExtractor.jsx'
import Visualizer from './tools/Visualizer.jsx'
import UnitCurrency from './tools/UnitCurrency.jsx'
import DecisionHub from './tools/DecisionHub.jsx'
import QRStudio from './tools/QRStudio.jsx'
import BackgroundStudio from './tools/BackgroundStudio.jsx'

export const TOOLS = [
  {
    id: 'metadata', n: 1, name: 'Metadata Extractor', icon: '🔍', color: '#C87941',
    tag: 'Image · Files',
    desc: 'Full EXIF / IPTC / XMP / GPS / ICC extraction with PDF reports and one-click Scrub & Sanitize.',
    keywords: 'exif iptc xmp gps metadata scrub sanitize clean privacy hex camera',
    comp: MetadataExtractor,
  },
  {
    id: 'converter', n: 2, name: 'Any-to-Any Converter', icon: '🔁', color: '#3E8ED0',
    tag: 'Convert',
    desc: 'Per-file batch conversion across image, video, audio, document & PDF formats with live progress.',
    keywords: 'convert png webp mp4 mkv wav flac gif jpg batch wasm ffmpeg',
    comp: Converter,
  },
  {
    id: 'compressor', n: 3, name: 'Target-Size Compressor', icon: '🎯', color: '#D04841',
    tag: 'Compress',
    desc: 'Hit an exact byte budget (25 MB for Discord/Email) with computed bitrates.',
    keywords: 'compress target size discord email bitrate crf ffmpeg reduce mb',
    comp: Compressor,
  },
  {
    id: 'clipper', n: 4, name: 'Media Clipper & Downloader', icon: '✂️', color: '#7B6CB0',
    tag: 'Download · Cut',
    desc: 'Paste any link — yt-dlp fetches it in the quality, format and time range you pick. Or clip a local file losslessly.',
    keywords: 'download yt-dlp youtube video audio mp3 clip trim cut waveform timeline url playlist section',
    comp: Clipper,
  },
  {
    id: 'imagestudio', n: 5, name: 'ImagePlayer Studio', icon: '🎨', color: '#E8A33D',
    tag: 'Image Edit',
    desc: 'GPU photo & video colour studio: 30+ looks, per-colour HSL mixer, 3-way grading, crop, straighten and export.',
    keywords: 'image photo video edit color colour grade hsl mixer hue saturation luminance brightness exposure temperature tint vibrance preset filter look lut crop rotate straighten flip resize vignette grain sharpen',
    comp: ImageStudio,
  },
  {
    id: 'bgremover', n: 6, name: 'AI Background Remover', icon: '🪄', color: '#2F9C95',
    tag: 'AI',
    desc: 'Offline (bundled) or Online (BiRefNet) AI cutouts. Refine brush, backgrounds, shadow, batch ZIP.',
    keywords: 'background remover birefnet online offline ai cutout transparent png mask erase hair isnet batch shadow blur',
    comp: BgRemover,
  },
  {
    id: 'frames', n: 7, name: 'Frame Extractor & Clipper', icon: '🎞️', color: '#B2675E',
    tag: 'Video',
    desc: 'Frame-by-frame stepping, hi-res snapshots, frame series, lossless trims & GIFs.',
    keywords: 'frame extractor snapshot gif webp video trim step fps clip',
    comp: FrameExtractor,
  },
  {
    id: 'visualizer', n: 8, name: 'Audio Visualizer Video', icon: '🎵', color: '#5F6CAF',
    tag: 'Audio · Video',
    desc: 'Turn MP3/WAV/FLAC into animated spectrum videos for any social ratio.',
    keywords: 'audio spectrum waveform visualizer video equalizer radial bars particles music',
    comp: Visualizer,
  },
  {
    id: 'units', n: 9, name: 'Unit & Currency Converter', icon: '⚖️', color: '#4E937A',
    tag: 'Offline-first',
    desc: '150+ currencies with daily live rates & full offline fallback, plus every unit.',
    keywords: 'currency exchange rate usd eur btc unit length mass temperature speed bytes energy offline',
    comp: UnitCurrency,
  },
  {
    id: 'decision', n: 10, name: 'Decision & Randomizer Hub', icon: '🎲', color: '#C3423F',
    tag: '3D · Fun',
    desc: 'Physics 3D coin flip, bottle spin, loaded dice & custom wheel spinner.',
    keywords: 'coin flip dice bottle spin wheel random decision d6 d20 loaded party',
    comp: DecisionHub,
  },
  {
    id: 'qr', n: 11, name: 'QR Code Studio', icon: '🔳', color: '#1F7A8C',
    tag: 'Generate',
    desc: 'Vector-grade QR with gradients, custom eyes, logos & high-DPI export.',
    keywords: 'qr code wifi vcard link gradient logo svg png generator studio',
    comp: QRStudio,
  },
  {
    id: 'backgrounds', n: 12, name: 'Background Canvas Studio', icon: '🌈', color: '#9D6BCE',
    tag: 'Design',
    desc: 'Wallpapers: mesh gradients, grain, presets & lossless 4K PNG export.',
    keywords: 'background wallpaper gradient mesh noise grain solid 4k avatar story canvas',
    comp: BackgroundStudio,
  },
]
