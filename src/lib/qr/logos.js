/* Built-in centre logos. 24×24 artwork using currentColor. Brand-style marks are simplified, generic glyphs. */
const S = (inner) => `<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
const F = (inner) => `<g fill="currentColor">${inner}</g>`
const T = (t, size = 15, w = 800) => `<text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="${w}" font-size="${size}" fill="currentColor">${t}</text>`

export const LOGOS = [
  // essentials
  { id: 'link', name: 'Link', g: 'Essentials', art: S('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>') },
  { id: 'globe', name: 'Web', g: 'Essentials', art: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>') },
  { id: 'scan', name: 'Scan', g: 'Essentials', art: S('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 12h8"/>') },
  { id: 'bolt', name: 'Bolt', g: 'Essentials', art: F('<path d="M13.5 2 5 13.5h5.5L9.5 22 19 10h-5.8Z"/>') },
  { id: 'star', name: 'Star', g: 'Essentials', art: F('<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z"/>') },
  { id: 'heart', name: 'Heart', g: 'Essentials', art: F('<path d="M12 21s-8.5-5.3-8.5-11.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8.5 2.8C20.5 15.700 12 21 12 21Z"/>') },
  { id: 'shield', name: 'Secure', g: 'Essentials', art: S('<path d="M12 3 4.5 6v5.500c0 4.500 3.100 8 7.500 9.500 4.400-1.500 7.500-5 7.500-9.500V6Z"/><path d="m8.500 12 2.500 2.500 4.500-5"/>') },
  { id: 'gift', name: 'Gift', g: 'Essentials', art: S('<rect x="3.500" y="8.500" width="17" height="4" rx="1"/><path d="M5 12.500V20h14v-7.500M12 8.500V20M12 8.500C9 8.500 7 7 7.500 5.500S11 5 12 8.500c1-3.500 3.500-4.200 4.500-3S15 8.500 12 8.500Z"/>') },
  { id: 'leaf', name: 'Leaf', g: 'Essentials', art: S('<path d="M5 19C4 11 9 5 20 4c0 11-6 16-13 15"/><path d="M5 19c3-5 6-8 10-10"/>') },
  // contact & places
  { id: 'mail', name: 'Mail', g: 'Contact', art: S('<rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="m3.500 7.500 8.500 6 8.500-6"/>') },
  { id: 'phone', name: 'Phone', g: 'Contact', art: S('<path d="M5 3.500h3.500l1.800 4.500-2.200 1.500a11 11 0 0 0 5.400 5.400l1.500-2.200 4.500 1.800V18a2.500 2.500 0 0 1-2.500 2.500A15.500 15.500 0 0 1 2.500 6 2.500 2.500 0 0 1 5 3.500Z"/>') },
  { id: 'chat', name: 'Chat', g: 'Contact', art: S('<path d="M4 5.500h16v10.500H10l-4.500 4v-4H4Z"/><path d="M8 10h8M8 13h5"/>') },
  { id: 'user', name: 'Person', g: 'Contact', art: S('<circle cx="12" cy="8" r="4"/><path d="M4.500 20.500c.8-4 3.700-6 7.500-6s6.700 2 7.500 6"/>') },
  { id: 'pin', name: 'Location', g: 'Contact', art: S('<path d="M12 21.500s7-6.200 7-12A7 7 0 0 0 5 9.500c0 5.800 7 12 7 12Z"/><circle cx="12" cy="9.500" r="2.500"/>') },
  { id: 'wifi', name: 'Wi-Fi', g: 'Contact', art: S('<path d="M2.500 9a14 14 0 0 1 19 0M5.500 12.500a9.500 9.500 0 0 1 13 0M8.500 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.500" r=".6" fill="currentColor"/>') },
  { id: 'home', name: 'Home', g: 'Contact', art: S('<path d="M3.500 11 12 4l8.500 7M6 9.500V20h12V9.500M10 20v-5.500h4V20"/>') },
  // life
  { id: 'calendar', name: 'Event', g: 'Life', art: S('<rect x="3.500" y="5" width="17" height="15.500" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>') },
  { id: 'ticket', name: 'Ticket', g: 'Life', art: S('<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 0v4.500h18V12a2 2 0 0 1 0-4V5.500H3Z" transform="translate(0 1)"/><path d="M14 6.500v11" stroke-dasharray="1.800 2.200"/>') },
  { id: 'cart', name: 'Shop', g: 'Life', art: S('<path d="M3 4h2.500l2 11h10.500l2-8H7"/><circle cx="9.500" cy="19.500" r="1.400"/><circle cx="17" cy="19.500" r="1.400"/>') },
  { id: 'coffee', name: 'Café', g: 'Life', art: S('<path d="M4.500 9h12v5.500a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5ZM16.500 10.500H18a2.500 2.500 0 0 1 0 5h-1.500M8 3.500v2.500M12 3.500v2.500"/>') },
  { id: 'food', name: 'Menu', g: 'Life', art: S('<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7a2 2 0 0 1-2 2M8 3v9M17.500 21V3c-2.200 1.200-3.500 4-3.500 7 0 1.800 1 3 3.500 3"/>') },
  { id: 'camera', name: 'Camera', g: 'Life', art: S('<path d="M4 8h3l1.500-2.500h7L17 8h3a1 1 0 0 1 1 1v9.500a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.500" r="3.500"/>') },
  { id: 'music', name: 'Music', g: 'Life', art: S('<path d="M9 18V6l11-2v12"/><circle cx="6.500" cy="18" r="2.500"/><circle cx="17.500" cy="16" r="2.500"/>') },
  { id: 'play', name: 'Play', g: 'Life', art: F('<path d="M7 4.500v15L19.500 12Z"/>') },
  { id: 'file', name: 'PDF', g: 'Life', art: S('<path d="M6 3h8l4.500 4.500V21H6Z"/><path d="M14 3v4.500h4.500M9 13h6M9 16.500h6"/>') },
  // brands (simplified glyphs)
  { id: 'instagram', name: 'Instagram', g: 'Social', brand: ['#E1306C', '#FFFFFF'], art: S('<rect x="3.500" y="3.500" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".5" fill="currentColor"/>') },
  { id: 'youtube', name: 'YouTube', g: 'Social', brand: ['#FF0000', '#FFFFFF'], art: F('<path d="M21.500 8a2.800 2.800 0 0 0-2-2C17.800 5.500 12 5.500 12 5.500s-5.800 0-7.500.5a2.800 2.800 0 0 0-2 2C2 9.600 2 12 2 12s0 2.400.5 4a2.800 2.800 0 0 0 2 2c1.700.5 7.500.5 7.500.5s5.800 0 7.500-.5a2.800 2.800 0 0 0 2-2c.5-1.600.5-4 .5-4s0-2.400-.5-4ZM10 15V9l5.200 3Z" fill-rule="evenodd"/>') },
  { id: 'facebook', name: 'Facebook', g: 'Social', brand: ['#1877F2', '#FFFFFF'], art: T('f', 24, 900) },
  { id: 'x', name: 'X', g: 'Social', brand: ['#111111', '#FFFFFF'], art: S('<path d="M5 4.500 19 19.500M19 4.500 5 19.500" stroke-width="2.400"/>') },
  { id: 'linkedin', name: 'LinkedIn', g: 'Social', brand: ['#0A66C2', '#FFFFFF'], art: T('in', 15, 900) },
  { id: 'whatsapp', name: 'WhatsApp', g: 'Social', brand: ['#25D366', '#FFFFFF'], art: S('<path d="M4 20l1.200-4A8.500 8.500 0 1 1 8 18.800Z"/><path d="M9 8.500c0 3.500 3 6.500 6.500 6.500l1-1.300-2.200-1.100-.9.800a4.300 4.300 0 0 1-2.300-2.300l.8-.9L10.800 8.100Z" fill="currentColor" stroke-width="1"/>') },
  { id: 'telegram', name: 'Telegram', g: 'Social', brand: ['#2AABEE', '#FFFFFF'], art: F('<path d="M21 4 3 11l5.500 2L10 19l3-3.500 4.500 3.500Zm-3 3.500-7.200 6.800-.5 2.300-.9-3.500Z" fill-rule="evenodd"/>') },
  { id: 'spotify', name: 'Spotify', g: 'Social', brand: ['#1DB954', '#FFFFFF'], art: S('<path d="M5.500 9.500c4.500-1.500 9.500-1 13 1.300M6.500 13c3.500-1 7-.6 10 1M7.500 16.300c2.700-.7 5-.5 7.500.8" stroke-width="2.200"/>') },
  { id: 'tiktok', name: 'TikTok', g: 'Social', brand: ['#010101', '#FFFFFF'], art: S('<path d="M14 3v11.500a3.500 3.500 0 1 1-3.500-3.500M14 3c.3 2.700 2.200 4.500 5 4.700" stroke-width="2.200"/>') },
  // money
  { id: 'bitcoin', name: 'Bitcoin', g: 'Money', brand: ['#F7931A', '#FFFFFF'], art: T('₿', 19, 800) },
  { id: 'ethereum', name: 'Ethereum', g: 'Money', brand: ['#627EEA', '#FFFFFF'], art: F('<path d="M12 2.500 5.500 12.500 12 16.500l6.500-4Zm0 15.200-6.500-4 6.500 8 6.500-8Z"/>') },
  { id: 'card', name: 'Card', g: 'Money', art: S('<rect x="3" y="5.500" width="18" height="13" rx="2.500"/><path d="M3 10h18M6.500 15h4"/>') },
  { id: 'rupee', name: 'Rs.', g: 'Money', art: T('Rs', 12, 900) },
  { id: 'dollar', name: 'Dollar', g: 'Money', art: T('$', 19, 900) },
  { id: 'euro', name: 'Euro', g: 'Money', art: T('€', 19, 900) },
]
export const LOGO_GROUPS = ['Essentials', 'Contact', 'Life', 'Social', 'Money']
export const logoById = (id) => LOGOS.find((l) => l.id === id)

/** inner svg for a logo centred at (cx,cy) fitting in `size` module units */
export function logoMarkup(logo, cx, cy, size, color) {
  const k = size / 24
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${k})" style="color:${color}" color="${color}">${logo.art}</g>`
}
