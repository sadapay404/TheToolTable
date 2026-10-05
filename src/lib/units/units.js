// Unit catalogue. Every category converts through an SI-style base unit (f = size of 1 unit in base units).
// Units with a custom curve (temperature, fuel economy) provide to()/from() instead of f.
const U = (k, n, f, alt = '') => ({ k, n, f, alt })

export const CATEGORIES = [
  { id: 'length', name: 'Length', icon: 'ruler', base: 'm', def: ['km', 'mi'], units: [
    U('km', 'Kilometre', 1000, 'kilometer'), U('m', 'Metre', 1, 'meter'), U('cm', 'Centimetre', 0.01, 'centimeter'), U('mm', 'Millimetre', 0.001, 'millimeter'), U('µm', 'Micrometre', 1e-6, 'micron'), U('nm', 'Nanometre', 1e-9),
    U('mi', 'Mile', 1609.344), U('yd', 'Yard', 0.9144), U('ft', 'Foot', 0.3048, 'feet'), U('in', 'Inch', 0.0254, 'inches'), U('nmi', 'Nautical mile', 1852), U('fathom', 'Fathom', 1.8288), U('furlong', 'Furlong', 201.168), U('league', 'League', 4828.032),
    U('Å', 'Ångström', 1e-10, 'angstrom'), U('au', 'Astronomical unit', 1.495978707e11), U('ly', 'Light-year', 9.4607304725808e15), U('pc', 'Parsec', 3.0856775814914e16)] },
  { id: 'mass', name: 'Mass', icon: 'scale', base: 'kg', def: ['kg', 'lb'], units: [
    U('kg', 'Kilogram', 1, 'kilo'), U('g', 'Gram', 0.001), U('mg', 'Milligram', 1e-6), U('µg', 'Microgram', 1e-9), U('t', 'Tonne (metric)', 1000, 'ton'), U('lb', 'Pound', 0.45359237, 'pounds'), U('oz', 'Ounce', 0.028349523125),
    U('st', 'Stone', 6.35029318), U('long ton', 'Long ton (UK)', 1016.0469088), U('short ton', 'Short ton (US)', 907.18474), U('ct', 'Carat', 0.0002), U('gr', 'Grain', 6.479891e-5),
    U('tola', 'Tola', 0.01166375), U('seer', 'Seer (Pakistan)', 0.93310), U('maund', 'Maund (Pakistan)', 37.3242), U('slug', 'Slug', 14.5939029)] },
  { id: 'area', name: 'Area', icon: 'area', base: 'm²', def: ['m²', 'ft²'], units: [
    U('m²', 'Square metre', 1), U('km²', 'Square kilometre', 1e6), U('cm²', 'Square centimetre', 1e-4), U('mm²', 'Square millimetre', 1e-6), U('ha', 'Hectare', 1e4),
    U('ac', 'Acre', 4046.8564224), U('ft²', 'Square foot', 0.09290304), U('yd²', 'Square yard', 0.83612736), U('in²', 'Square inch', 6.4516e-4), U('mi²', 'Square mile', 2589988.110336),
    U('marla', 'Marla (Pakistan)', 25.2929538), U('kanal', 'Kanal (Pakistan)', 505.857), U('sq rod', 'Square rod', 25.29285264)] },
  { id: 'volume', name: 'Volume', icon: 'cube', base: 'L', def: ['L', 'gal'], units: [
    U('L', 'Litre', 1, 'liter'), U('mL', 'Millilitre', 0.001, 'milliliter'), U('m³', 'Cubic metre', 1000), U('cm³', 'Cubic centimetre', 0.001, 'cc'), U('gal', 'Gallon (US)', 3.785411784),
    U('gal UK', 'Gallon (UK)', 4.54609), U('qt', 'Quart (US)', 0.946352946), U('pt', 'Pint (US)', 0.473176473), U('cup', 'Cup (US)', 0.2365882365), U('fl oz', 'Fluid ounce (US)', 0.0295735295625),
    U('tbsp', 'Tablespoon (US)', 0.01478676478125), U('tsp', 'Teaspoon (US)', 0.00492892159375), U('ft³', 'Cubic foot', 28.316846592), U('in³', 'Cubic inch', 0.016387064), U('bbl', 'Oil barrel', 158.987294928)] },
  { id: 'temperature', name: 'Temperature', icon: 'thermo', base: '°C', def: ['°C', '°F'], units: [
    { k: '°C', n: 'Celsius', alt: 'centigrade', to: (v) => v, from: (b) => b },
    { k: '°F', n: 'Fahrenheit', alt: '', to: (v) => ((v - 32) * 5) / 9, from: (b) => (b * 9) / 5 + 32 },
    { k: 'K', n: 'Kelvin', alt: '', to: (v) => v - 273.15, from: (b) => b + 273.15 },
    { k: '°R', n: 'Rankine', alt: '', to: (v) => ((v - 491.67) * 5) / 9, from: (b) => ((b + 273.15) * 9) / 5 },
    { k: '°Ré', n: 'Réaumur', alt: 'reaumur', to: (v) => (v * 5) / 4, from: (b) => (b * 4) / 5 }] },
  { id: 'speed', name: 'Speed', icon: 'gauge', base: 'm/s', def: ['km/h', 'mph'], units: [
    U('km/h', 'Kilometre/hour', 1 / 3.6), U('m/s', 'Metre/second', 1), U('mph', 'Mile/hour', 0.44704), U('kn', 'Knot', 0.514444444), U('ft/s', 'Foot/second', 0.3048), U('Mach', 'Mach (sea level)', 340.29), U('c', 'Speed of light', 299792458)] },
  { id: 'time', name: 'Duration', icon: 'hourglass', base: 's', def: ['h', 'min'], units: [
    U('ns', 'Nanosecond', 1e-9), U('µs', 'Microsecond', 1e-6), U('ms', 'Millisecond', 1e-3), U('s', 'Second', 1), U('min', 'Minute', 60), U('h', 'Hour', 3600), U('day', 'Day', 86400), U('week', 'Week', 604800),
    U('month', 'Month (avg)', 2629800), U('year', 'Year (365.25 d)', 31557600), U('decade', 'Decade', 315576000), U('century', 'Century', 3155760000)] },
  { id: 'pressure', name: 'Pressure', icon: 'dial', base: 'Pa', def: ['bar', 'psi'], units: [
    U('Pa', 'Pascal', 1), U('kPa', 'Kilopascal', 1e3), U('MPa', 'Megapascal', 1e6), U('bar', 'Bar', 1e5), U('mbar', 'Millibar', 100), U('atm', 'Atmosphere', 101325), U('psi', 'Pound/sq inch', 6894.757293168),
    U('mmHg', 'mm of mercury', 133.322387415), U('inHg', 'in of mercury', 3386.389), U('Torr', 'Torr', 133.32236842)] },
  { id: 'energy', name: 'Energy', icon: 'bolt', base: 'J', def: ['kcal', 'kJ'], units: [
    U('J', 'Joule', 1), U('kJ', 'Kilojoule', 1e3), U('MJ', 'Megajoule', 1e6), U('cal', 'Calorie', 4.184), U('kcal', 'Kilocalorie (food)', 4184, 'Calorie'), U('Wh', 'Watt-hour', 3600), U('kWh', 'Kilowatt-hour', 3.6e6),
    U('BTU', 'British thermal unit', 1055.05585262), U('eV', 'Electronvolt', 1.602176634e-19), U('ft·lbf', 'Foot-pound', 1.3558179483), U('therm', 'Therm', 1.05505585262e8)] },
  { id: 'power', name: 'Power', icon: 'plug', base: 'W', def: ['hp', 'kW'], units: [
    U('W', 'Watt', 1), U('kW', 'Kilowatt', 1e3), U('MW', 'Megawatt', 1e6), U('hp', 'Horsepower (mech.)', 745.69987158), U('PS', 'Horsepower (metric)', 735.49875), U('BTU/h', 'BTU per hour', 0.29307107), U('TR', 'Ton of refrigeration', 3516.85284)] },
  { id: 'force', name: 'Force', icon: 'arrow', base: 'N', def: ['N', 'lbf'], units: [
    U('N', 'Newton', 1), U('kN', 'Kilonewton', 1e3), U('lbf', 'Pound-force', 4.4482216152605), U('kgf', 'Kilogram-force', 9.80665), U('dyn', 'Dyne', 1e-5), U('ozf', 'Ounce-force', 0.27801385)] },
  { id: 'angle', name: 'Angle', icon: 'angle', base: '°', def: ['°', 'rad'], units: [
    U('°', 'Degree', 1, 'deg'), U('rad', 'Radian', 180 / Math.PI), U('grad', 'Gradian', 0.9, 'gon'), U('′', 'Arcminute', 1 / 60, 'arcmin'), U('″', 'Arcsecond', 1 / 3600, 'arcsec'), U('turn', 'Full turn', 360, 'revolution')] },
  { id: 'storage', name: 'Data size', icon: 'disk', base: 'B', def: ['GB', 'MB'], units: [
    U('bit', 'Bit', 0.125), U('B', 'Byte', 1), U('KB', 'Kilobyte', 1e3), U('MB', 'Megabyte', 1e6), U('GB', 'Gigabyte', 1e9), U('TB', 'Terabyte', 1e12), U('PB', 'Petabyte', 1e15),
    U('KiB', 'Kibibyte', 1024), U('MiB', 'Mebibyte', 1048576), U('GiB', 'Gibibyte', 1073741824), U('TiB', 'Tebibyte', 1099511627776), U('PiB', 'Pebibyte', 1125899906842624)] },
  { id: 'rate', name: 'Data rate', icon: 'wave', base: 'bit/s', def: ['Mbit/s', 'MB/s'], units: [
    U('bit/s', 'Bit/second', 1), U('kbit/s', 'Kilobit/second', 1e3), U('Mbit/s', 'Megabit/second', 1e6), U('Gbit/s', 'Gigabit/second', 1e9), U('B/s', 'Byte/second', 8), U('KB/s', 'Kilobyte/second', 8e3), U('MB/s', 'Megabyte/second', 8e6), U('GB/s', 'Gigabyte/second', 8e9), U('MiB/s', 'Mebibyte/second', 8388608)] },
  { id: 'frequency', name: 'Frequency', icon: 'pulse', base: 'Hz', def: ['MHz', 'GHz'], units: [
    U('Hz', 'Hertz', 1), U('kHz', 'Kilohertz', 1e3), U('MHz', 'Megahertz', 1e6), U('GHz', 'Gigahertz', 1e9), U('rpm', 'Revolutions/min', 1 / 60), U('BPM', 'Beats/min', 1 / 60)] },
  { id: 'fuel', name: 'Fuel economy', icon: 'fuel', base: 'L/100km', def: ['km/L', 'mpg US'], units: [
    { k: 'L/100km', n: 'Litres / 100 km', alt: '', to: (v) => v, from: (b) => b },
    { k: 'km/L', n: 'Kilometres / litre', alt: '', to: (v) => (v ? 100 / v : Infinity), from: (b) => (b ? 100 / b : Infinity) },
    { k: 'mpg US', n: 'Miles / gallon (US)', alt: '', to: (v) => (v ? 235.214583 / v : Infinity), from: (b) => (b ? 235.214583 / b : Infinity) },
    { k: 'mpg UK', n: 'Miles / gallon (UK)', alt: '', to: (v) => (v ? 282.480936 / v : Infinity), from: (b) => (b ? 282.480936 / b : Infinity) }] },
]
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

const UNIT_NUMBER = /^-?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const UNIT_NUMBER_DRAFT = /^-?(?:\d[\d,]*(?:\.\d*)?|\.\d*)?(?:e[+-]?\d*)?$/i

/** Parse a plain number or a correctly grouped value such as 1,234.5; reject malformed commas. */
export function parseUnitValue(value) {
  const text = String(value ?? '').trim()
  if (!UNIT_NUMBER.test(text)) return NaN
  const number = Number(text.replace(/,/g, ''))
  return Number.isFinite(number) ? number : NaN
}
export const isUnitNumberDraft = (value) => UNIT_NUMBER_DRAFT.test(String(value ?? ''))

export function convertUnit(cat, v, fromK, toK) {
  const c = CAT[cat]
  if (!c || !Number.isFinite(v)) return NaN
  const a = c.units.find((u) => u.k === fromK), b = c.units.find((u) => u.k === toK)
  if (!a || !b) return NaN
  const base = a.to ? a.to(v) : v * a.f
  return b.from ? b.from(base) : base / b.f
}

/** formatted for people: grouped digits, no float noise, scientific for extremes */
export function fmtNum(n, mode = 'auto') {
  if (!Number.isFinite(n)) return n === Infinity ? '∞' : '—'
  if (n === 0) return '0'
  const a = Math.abs(n)
  if (mode === 'sci') return n.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e')
  if (mode !== 'auto') {
    const decimals = Number(mode)
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) return fmtNum(n, 'auto')
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }
  if (a >= 1e15 || a < 1e-7) return n.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e')
  const digits = a >= 1000 ? 6 : a >= 1 ? 8 : 10
  return Number(n.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 12 })
}
