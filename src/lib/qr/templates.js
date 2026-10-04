/* Built-in style templates. Each is a partial style merged over DEFAULT_STYLE. */
const E = (frame, ball, fc, bc, extra = {}) => ({ frame, ball, frameColor: fc, ballColor: bc, sync: false, per: false, ...extra })
const D = (shape, color, extra = {}) => ({ shape, color, scale: 1, fill: 'solid', ...extra })
const BG = (color, extra = {}) => ({ type: 'solid', color, radius: 0.04, ...extra })
const G = (a, b, c = null, angle = 45) => ({ fill: 'gradient', color: a, c2: b, c3: c || b, stops: c ? 3 : 2, angle, grad: 'linear' })
const F = (style, label, color, text, font = 'sans') => ({ style, label, color, text, font })

export const TEMPLATE_CATS = ['Clean', 'Colourful', 'Dark', 'Occasions', 'Brands']
export const TEMPLATES = [
  // clean
  { id: 'minimal', name: 'Minimal', cat: 'Clean', style: { dots: D('square', '#111111'), eyes: E('square', 'square', '#111111', '#111111'), bg: BG('#FFFFFF', { radius: 0 }) } },
  { id: 'classic', name: 'Classic', cat: 'Clean', style: { dots: D('soft', '#1A1411'), eyes: E('rounded', 'rounded', '#1A1411', '#B4715A'), bg: BG('#FFFFFF') } },
  { id: 'ink', name: 'Ink blot', cat: 'Clean', style: { dots: D('liquid', '#16110E'), eyes: E('leaf', 'leaf', '#16110E', '#16110E'), bg: BG('#FBF8F2') } },
  { id: 'paper', name: 'Paper', cat: 'Clean', style: { dots: D('liquid', '#3B2A22'), eyes: E('soft', 'circle', '#3B2A22', '#B4715A'), bg: BG('#F0EDE4', { radius: 0.08 }) } },
  { id: 'dotty', name: 'Dotty', cat: 'Clean', style: { dots: D('dots', '#222222', { scale: 0.86 }), eyes: E('circle', 'circle', '#222222', '#222222'), bg: BG('#FFFFFF') } },
  { id: 'businesscard', name: 'Business card', cat: 'Clean', style: { dots: D('soft', '#1D2B3A'), eyes: E('rounded', 'rounded', '#1D2B3A', '#1D2B3A'), bg: BG('#FFFFFF'), frame: F('corners', 'SCAN TO CONNECT', '#1D2B3A', '#FFFFFF') } },
  { id: 'brutalist', name: 'Brutalist', cat: 'Clean', style: { dots: D('square', '#000000'), eyes: E('square', 'square', '#000000', '#000000'), bg: BG('#FFE600', { radius: 0 }), margin: 3, frame: F('label-bottom', 'SCAN', '#000000', '#FFE600', 'display') } },
  { id: 'bars', name: 'Barcode', cat: 'Clean', style: { dots: D('barsv', '#101010', { scale: 1 }), eyes: E('square', 'square', '#101010', '#101010'), bg: BG('#FFFFFF', { radius: 0 }) } },
  // colourful
  { id: 'sunset', name: 'Sunset', cat: 'Colourful', style: { dots: { ...D('liquid', '#FF5F6D'), ...G('#FF512F', '#DD2476', '#8E2DE2', 60) }, eyes: E('rounded', 'rounded', '#DD2476', '#FF512F'), bg: BG('#FFF7F2') } },
  { id: 'ocean', name: 'Ocean', cat: 'Colourful', style: { dots: { ...D('soft', '#0575E6'), ...G('#00C6FB', '#005BEA', null, 90) }, eyes: E('circle', 'circle', '#005BEA', '#00C6FB'), bg: BG('#F2FAFF') } },
  { id: 'forest', name: 'Forest', cat: 'Colourful', style: { dots: { ...D('hexagon', '#134E5E'), ...G('#134E5E', '#71B280') }, eyes: E('leaf', 'leaf', '#134E5E', '#71B280'), bg: BG('#F4FAF3') } },
  { id: 'candy', name: 'Candy pop', cat: 'Colourful', style: { dots: D('dots', '#FF4D8D', { fill: 'duo', c2: '#7C4DFF', duo: 'random', scale: 0.92 }), eyes: E('circle', 'circle', '#FF4D8D', '#7C4DFF'), bg: BG('#FFF4FA', { radius: 0.1 }) } },
  { id: 'duotone', name: 'Duotone', cat: 'Colourful', style: { dots: D('soft', '#0F4C81', { fill: 'duo', c2: '#F2A900', duo: 'rings' }), eyes: E('soft', 'rounded', '#0F4C81', '#F2A900'), bg: BG('#FFFFFF') } },
  { id: 'stripes', name: 'Stripes', cat: 'Colourful', style: { dots: D('square', '#2B2D42', { fill: 'duo', c2: '#EF233C', duo: 'rows' }), eyes: E('square', 'square', '#2B2D42', '#EF233C'), bg: BG('#EDF2F4', { radius: 0.02 }) } },
  { id: 'honey', name: 'Honeycomb', cat: 'Colourful', style: { dots: { ...D('hexagon', '#F59E0B'), ...G('#F59E0B', '#B45309') }, eyes: E('cut', 'cut', '#92400E', '#F59E0B'), bg: BG('#FFFBEB') } },
  { id: 'stars', name: 'Starlight', cat: 'Colourful', style: { dots: { ...D('star', '#6D28D9'), ...G('#6D28D9', '#DB2777') }, eyes: E('soft', 'star', '#6D28D9', '#DB2777'), bg: BG('#FBF7FF') } },
  // dark
  { id: 'neon', name: 'Neon', cat: 'Dark', style: { dots: { ...D('dots', '#00F5FF'), ...G('#00F5FF', '#FF2BD6', null, 135), scale: 0.88 }, eyes: E('circle', 'circle', '#00F5FF', '#FF2BD6'), bg: BG('#0B0B1A', { radius: 0.06 }) } },
  { id: 'cyber', name: 'Cyberpunk', cat: 'Dark', style: { dots: D('square', '#FCEE0A', { scale: 0.9 }), eyes: E('cut', 'cut', '#FCEE0A', '#FF003C'), bg: BG('#0D0221', { radius: 0.02 }) } },
  { id: 'terminal', name: 'Terminal', cat: 'Dark', style: { dots: D('square', '#39FF14', { scale: 0.84 }), eyes: E('square', 'square', '#39FF14', '#39FF14'), bg: BG('#04110A', { radius: 0 }), frame: F('label-bottom', '> SCAN_ME', '#39FF14', '#04110A', 'mono') } },
  { id: 'gold', name: 'Royal gold', cat: 'Dark', style: { dots: { ...D('liquid', '#E8C872'), ...G('#F7E7A5', '#C79A2B', '#8A6516', 60) }, eyes: E('soft', 'rounded', '#E8C872', '#C79A2B'), bg: BG('#111111', { radius: 0.06 }) } },
  { id: 'midnight', name: 'Midnight', cat: 'Dark', style: { dots: { ...D('soft', '#A5B4FC'), ...G('#A5B4FC', '#67E8F9') }, eyes: E('rounded', 'circle', '#A5B4FC', '#67E8F9'), bg: BG('#0F172A', { radius: 0.06 }) } },
  { id: 'aurora', name: 'Aurora', cat: 'Dark', style: { dots: { ...D('liquid', '#34D399'), ...G('#34D399', '#60A5FA', '#C084FC', 120) }, eyes: E('leaf', 'leaf', '#34D399', '#C084FC'), bg: { type: 'gradient', color: '#0B1020', c2: '#16213E', angle: 135, radius: 0.06 } } },
  // occasions
  { id: 'wedding', name: 'Wedding', cat: 'Occasions', style: { dots: D('heart', '#B76E79', { scale: 0.92 }), eyes: E('circle', 'circle', '#B76E79', '#8A4B55'), bg: BG('#FFF6F4', { radius: 0.08 }), frame: F('label-bottom', 'JOIN OUR DAY', '#B76E79', '#FFF6F4', 'serif') } },
  { id: 'restaurant', name: 'Restaurant menu', cat: 'Occasions', style: { dots: D('liquid', '#3A1F14'), eyes: E('rounded', 'rounded', '#3A1F14', '#C0392B'), bg: BG('#FFF9F0'), frame: F('label-bottom', 'SCAN FOR MENU', '#3A1F14', '#FFE9C7', 'serif') } },
  { id: 'cafe', name: 'Café', cat: 'Occasions', style: { dots: D('soft', '#5B3A29'), eyes: E('soft', 'circle', '#5B3A29', '#B4715A'), bg: BG('#F5EBDD', { radius: 0.1 }), frame: F('banner', 'COFFEE MENU', '#5B3A29', '#F5EBDD', 'round') } },
  { id: 'event', name: 'Event pass', cat: 'Occasions', style: { dots: { ...D('soft', '#4F46E5'), ...G('#4F46E5', '#06B6D4') }, eyes: E('rounded', 'rounded', '#4F46E5', '#06B6D4'), bg: BG('#FFFFFF'), frame: F('tag', 'EVENT PASS', '#4F46E5', '#FFFFFF') } },
  { id: 'sticker', name: 'Sticker', cat: 'Occasions', style: { dots: D('dots', '#111827', { scale: 0.9 }), eyes: E('circle', 'circle', '#111827', '#EF4444'), bg: BG('#FFFFFF', { radius: 0.12 }), frame: F('bubble', 'SCAN ME!', '#EF4444', '#FFFFFF', 'round') } },
  { id: 'eid', name: 'Festive green', cat: 'Occasions', style: { dots: D('star', '#01411C', { scale: 0.96 }), eyes: E('soft', 'star', '#01411C', '#C9A227'), bg: BG('#F6FBF4', { radius: 0.08 }), frame: F('label-bottom', 'SCAN', '#01411C', '#F6FBF4', 'serif') } },
  // brands
  { id: 'insta', name: 'Instagram', cat: 'Brands', style: { dots: { ...D('dots', '#E1306C'), ...G('#F58529', '#DD2A7B', '#8134AF', 45), scale: 0.9 }, eyes: E('circle', 'circle', '#8134AF', '#DD2A7B'), bg: BG('#FFFFFF'), logo: { id: 'instagram', badge: 'rounded', badgeColor: '#E1306C', color: '#FFFFFF' } } },
  { id: 'wa', name: 'WhatsApp', cat: 'Brands', style: { dots: D('soft', '#128C7E'), eyes: E('rounded', 'rounded', '#075E54', '#25D366'), bg: BG('#F0FFF4'), logo: { id: 'whatsapp', badge: 'circle', badgeColor: '#25D366', color: '#FFFFFF' } } },
  { id: 'yt', name: 'YouTube', cat: 'Brands', style: { dots: D('liquid', '#CC0000'), eyes: E('rounded', 'rounded', '#CC0000', '#212121'), bg: BG('#FFFFFF'), logo: { id: 'youtube', badge: 'rounded', badgeColor: '#FF0000', color: '#FFFFFF' } } },
  { id: 'wifi', name: 'Guest Wi-Fi', cat: 'Brands', style: { dots: D('soft', '#0B3C5D'), eyes: E('rounded', 'circle', '#0B3C5D', '#1D9BF0'), bg: BG('#F4FAFF'), logo: { id: 'wifi', badge: 'circle', badgeColor: '#1D9BF0', color: '#FFFFFF' }, frame: F('label-bottom', 'JOIN WI-FI', '#0B3C5D', '#FFFFFF') } },
  { id: 'pk', name: 'Pakistan', cat: 'Brands', style: { dots: D('liquid', '#01411C'), eyes: E('soft', 'rounded', '#01411C', '#01411C'), bg: BG('#FFFFFF'), frame: F('label-bottom', 'SCAN ME', '#01411C', '#FFFFFF', 'round'), logo: { id: 'star', badge: 'circle', badgeColor: '#01411C', color: '#FFFFFF' } } },
]
