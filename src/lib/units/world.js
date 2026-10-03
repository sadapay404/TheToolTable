// All 195 countries (193 UN members + the Holy See + Palestine) with the time zone of their capital,
// extra zones for the big multi-zone countries, and the maths to move a wall-clock time between zones.
// Zone rules come from the browser's own tz database (Intl), so DST is always right.

const RAW = `AF|Kabul|Asia/Kabul
AL|Tirana|Europe/Tirane
DZ|Algiers|Africa/Algiers
AD|Andorra la Vella|Europe/Andorra
AO|Luanda|Africa/Luanda
AG|Saint John's|America/Antigua
AR|Buenos Aires|America/Argentina/Buenos_Aires
AM|Yerevan|Asia/Yerevan
AU|Canberra|Australia/Sydney
AT|Vienna|Europe/Vienna
AZ|Baku|Asia/Baku
BS|Nassau|America/Nassau
BH|Manama|Asia/Bahrain
BD|Dhaka|Asia/Dhaka
BB|Bridgetown|America/Barbados
BY|Minsk|Europe/Minsk
BE|Brussels|Europe/Brussels
BZ|Belmopan|America/Belize
BJ|Porto-Novo|Africa/Porto-Novo
BT|Thimphu|Asia/Thimphu
BO|La Paz|America/La_Paz
BA|Sarajevo|Europe/Sarajevo
BW|Gaborone|Africa/Gaborone
BR|Brasília|America/Sao_Paulo
BN|Bandar Seri Begawan|Asia/Brunei
BG|Sofia|Europe/Sofia
BF|Ouagadougou|Africa/Ouagadougou
BI|Gitega|Africa/Bujumbura
CV|Praia|Atlantic/Cape_Verde
KH|Phnom Penh|Asia/Phnom_Penh
CM|Yaoundé|Africa/Douala
CA|Ottawa|America/Toronto
CF|Bangui|Africa/Bangui
TD|N'Djamena|Africa/Ndjamena
CL|Santiago|America/Santiago
CN|Beijing|Asia/Shanghai
CO|Bogotá|America/Bogota
KM|Moroni|Indian/Comoro
CG|Brazzaville|Africa/Brazzaville
CD|Kinshasa|Africa/Kinshasa
CR|San José|America/Costa_Rica
CI|Yamoussoukro|Africa/Abidjan
HR|Zagreb|Europe/Zagreb
CU|Havana|America/Havana
CY|Nicosia|Asia/Nicosia
CZ|Prague|Europe/Prague
DK|Copenhagen|Europe/Copenhagen
DJ|Djibouti|Africa/Djibouti
DM|Roseau|America/Dominica
DO|Santo Domingo|America/Santo_Domingo
EC|Quito|America/Guayaquil
EG|Cairo|Africa/Cairo
SV|San Salvador|America/El_Salvador
GQ|Malabo|Africa/Malabo
ER|Asmara|Africa/Asmara
EE|Tallinn|Europe/Tallinn
SZ|Mbabane|Africa/Mbabane
ET|Addis Ababa|Africa/Addis_Ababa
FJ|Suva|Pacific/Fiji
FI|Helsinki|Europe/Helsinki
FR|Paris|Europe/Paris
GA|Libreville|Africa/Libreville
GM|Banjul|Africa/Banjul
GE|Tbilisi|Asia/Tbilisi
DE|Berlin|Europe/Berlin
GH|Accra|Africa/Accra
GR|Athens|Europe/Athens
GD|St. George's|America/Grenada
GT|Guatemala City|America/Guatemala
GN|Conakry|Africa/Conakry
GW|Bissau|Africa/Bissau
GY|Georgetown|America/Guyana
HT|Port-au-Prince|America/Port-au-Prince
HN|Tegucigalpa|America/Tegucigalpa
HU|Budapest|Europe/Budapest
IS|Reykjavík|Atlantic/Reykjavik
IN|New Delhi|Asia/Kolkata
ID|Jakarta|Asia/Jakarta
IR|Tehran|Asia/Tehran
IQ|Baghdad|Asia/Baghdad
IE|Dublin|Europe/Dublin
IL|Jerusalem|Asia/Jerusalem
IT|Rome|Europe/Rome
JM|Kingston|America/Jamaica
JP|Tokyo|Asia/Tokyo
JO|Amman|Asia/Amman
KZ|Astana|Asia/Almaty
KE|Nairobi|Africa/Nairobi
KI|Tarawa|Pacific/Tarawa
KP|Pyongyang|Asia/Pyongyang
KR|Seoul|Asia/Seoul
KW|Kuwait City|Asia/Kuwait
KG|Bishkek|Asia/Bishkek
LA|Vientiane|Asia/Vientiane
LV|Riga|Europe/Riga
LB|Beirut|Asia/Beirut
LS|Maseru|Africa/Maseru
LR|Monrovia|Africa/Monrovia
LY|Tripoli|Africa/Tripoli
LI|Vaduz|Europe/Vaduz
LT|Vilnius|Europe/Vilnius
LU|Luxembourg|Europe/Luxembourg
MG|Antananarivo|Indian/Antananarivo
MW|Lilongwe|Africa/Blantyre
MY|Kuala Lumpur|Asia/Kuala_Lumpur
MV|Malé|Indian/Maldives
ML|Bamako|Africa/Bamako
MT|Valletta|Europe/Malta
MH|Majuro|Pacific/Majuro
MR|Nouakchott|Africa/Nouakchott
MU|Port Louis|Indian/Mauritius
MX|Mexico City|America/Mexico_City
FM|Palikir|Pacific/Pohnpei
MD|Chișinău|Europe/Chisinau
MC|Monaco|Europe/Monaco
MN|Ulaanbaatar|Asia/Ulaanbaatar
ME|Podgorica|Europe/Podgorica
MA|Rabat|Africa/Casablanca
MZ|Maputo|Africa/Maputo
MM|Naypyidaw|Asia/Yangon
NA|Windhoek|Africa/Windhoek
NR|Yaren|Pacific/Nauru
NP|Kathmandu|Asia/Kathmandu
NL|Amsterdam|Europe/Amsterdam
NZ|Wellington|Pacific/Auckland
NI|Managua|America/Managua
NE|Niamey|Africa/Niamey
NG|Abuja|Africa/Lagos
MK|Skopje|Europe/Skopje
NO|Oslo|Europe/Oslo
OM|Muscat|Asia/Muscat
PK|Islamabad|Asia/Karachi
PW|Ngerulmud|Pacific/Palau
PA|Panama City|America/Panama
PG|Port Moresby|Pacific/Port_Moresby
PY|Asunción|America/Asuncion
PE|Lima|America/Lima
PH|Manila|Asia/Manila
PL|Warsaw|Europe/Warsaw
PT|Lisbon|Europe/Lisbon
QA|Doha|Asia/Qatar
RO|Bucharest|Europe/Bucharest
RU|Moscow|Europe/Moscow
RW|Kigali|Africa/Kigali
KN|Basseterre|America/St_Kitts
LC|Castries|America/St_Lucia
VC|Kingstown|America/St_Vincent
WS|Apia|Pacific/Apia
SM|San Marino|Europe/San_Marino
ST|São Tomé|Africa/Sao_Tome
SA|Riyadh|Asia/Riyadh
SN|Dakar|Africa/Dakar
RS|Belgrade|Europe/Belgrade
SC|Victoria|Indian/Mahe
SL|Freetown|Africa/Freetown
SG|Singapore|Asia/Singapore
SK|Bratislava|Europe/Bratislava
SI|Ljubljana|Europe/Ljubljana
SB|Honiara|Pacific/Guadalcanal
SO|Mogadishu|Africa/Mogadishu
ZA|Pretoria|Africa/Johannesburg
SS|Juba|Africa/Juba
ES|Madrid|Europe/Madrid
LK|Colombo|Asia/Colombo
SD|Khartoum|Africa/Khartoum
SR|Paramaribo|America/Paramaribo
SE|Stockholm|Europe/Stockholm
CH|Bern|Europe/Zurich
SY|Damascus|Asia/Damascus
TJ|Dushanbe|Asia/Dushanbe
TZ|Dodoma|Africa/Dar_es_Salaam
TH|Bangkok|Asia/Bangkok
TL|Dili|Asia/Dili
TG|Lomé|Africa/Lome
TO|Nuku'alofa|Pacific/Tongatapu
TT|Port of Spain|America/Port_of_Spain
TN|Tunis|Africa/Tunis
TR|Ankara|Europe/Istanbul
TM|Ashgabat|Asia/Ashgabat
TV|Funafuti|Pacific/Funafuti
UG|Kampala|Africa/Kampala
UA|Kyiv|Europe/Kyiv
AE|Abu Dhabi|Asia/Dubai
GB|London|Europe/London
US|Washington, D.C.|America/New_York
UY|Montevideo|America/Montevideo
UZ|Tashkent|Asia/Tashkent
VU|Port Vila|Pacific/Efate
VE|Caracas|America/Caracas
VN|Hanoi|Asia/Ho_Chi_Minh
YE|Sana'a|Asia/Aden
ZM|Lusaka|Africa/Lusaka
ZW|Harare|Africa/Harare
VA|Vatican City|Europe/Vatican
PS|Ramallah|Asia/Hebron`

// Countries that span several zones: [IANA, label]. The capital zone is always offered first.
const EXTRA = {
  US: [['America/Chicago', 'Chicago'], ['America/Denver', 'Denver'], ['America/Phoenix', 'Phoenix'], ['America/Los_Angeles', 'Los Angeles'], ['America/Anchorage', 'Anchorage'], ['Pacific/Honolulu', 'Honolulu']],
  CA: [['America/Vancouver', 'Vancouver'], ['America/Edmonton', 'Edmonton'], ['America/Winnipeg', 'Winnipeg'], ['America/Halifax', 'Halifax'], ['America/St_Johns', "St. John's"]],
  RU: [['Europe/Kaliningrad', 'Kaliningrad'], ['Europe/Samara', 'Samara'], ['Asia/Yekaterinburg', 'Yekaterinburg'], ['Asia/Omsk', 'Omsk'], ['Asia/Novosibirsk', 'Novosibirsk'], ['Asia/Krasnoyarsk', 'Krasnoyarsk'], ['Asia/Irkutsk', 'Irkutsk'], ['Asia/Yakutsk', 'Yakutsk'], ['Asia/Vladivostok', 'Vladivostok'], ['Asia/Magadan', 'Magadan'], ['Asia/Kamchatka', 'Kamchatka']],
  AU: [['Australia/Brisbane', 'Brisbane'], ['Australia/Adelaide', 'Adelaide'], ['Australia/Darwin', 'Darwin'], ['Australia/Perth', 'Perth'], ['Australia/Hobart', 'Hobart']],
  BR: [['America/Manaus', 'Manaus'], ['America/Fortaleza', 'Fortaleza'], ['America/Cuiaba', 'Cuiabá'], ['America/Rio_Branco', 'Rio Branco'], ['America/Noronha', 'Fernando de Noronha']],
  MX: [['America/Cancun', 'Cancún'], ['America/Tijuana', 'Tijuana'], ['America/Hermosillo', 'Hermosillo'], ['America/Chihuahua', 'Chihuahua']],
  ID: [['Asia/Makassar', 'Makassar'], ['Asia/Jayapura', 'Jayapura']],
  CN: [['Asia/Urumqi', 'Ürümqi']],
  KZ: [['Asia/Aqtobe', 'Aktobe'], ['Asia/Aqtau', 'Aktau']],
  CL: [['America/Punta_Arenas', 'Punta Arenas'], ['Pacific/Easter', 'Easter Island']],
  EC: [['Pacific/Galapagos', 'Galápagos']],
  MN: [['Asia/Hovd', 'Khovd']],
  NZ: [['Pacific/Chatham', 'Chatham Islands']],
  PT: [['Atlantic/Azores', 'Azores'], ['Atlantic/Madeira', 'Madeira']],
  ES: [['Atlantic/Canary', 'Canary Islands']],
  KI: [['Pacific/Kanton', 'Kanton'], ['Pacific/Kiritimati', 'Kiritimati']],
  FM: [['Pacific/Chuuk', 'Chuuk'], ['Pacific/Kosrae', 'Kosrae']],
  CD: [['Africa/Lubumbashi', 'Lubumbashi']],
  PS: [['Asia/Gaza', 'Gaza']],
  GL: [],
}

const NAME_FIX = { US: 'United States', GB: 'United Kingdom', CD: 'DR Congo', CG: 'Republic of the Congo', KR: 'South Korea', KP: 'North Korea', MM: 'Myanmar', PS: 'Palestine', CZ: 'Czechia', TR: 'Türkiye', VA: 'Vatican City', FM: 'Micronesia', CV: 'Cabo Verde', SZ: 'Eswatini', MK: 'North Macedonia', TL: 'Timor-Leste', CI: "Côte d'Ivoire", BS: 'Bahamas', GM: 'Gambia', RU: 'Russia', LA: 'Laos', SY: 'Syria', VN: 'Vietnam', IR: 'Iran', TZ: 'Tanzania', BO: 'Bolivia', VE: 'Venezuela', MD: 'Moldova', BN: 'Brunei', ST: 'São Tomé & Príncipe', AG: 'Antigua & Barbuda', KN: 'Saint Kitts & Nevis', VC: 'St Vincent & Grenadines', LC: 'Saint Lucia', TT: 'Trinidad & Tobago', BA: 'Bosnia & Herzegovina' }
const CONT_FIX = { MV: 'Asia', IS: 'Europe', CV: 'Africa', MU: 'Africa', SC: 'Africa', KM: 'Africa', MG: 'Africa', TR: 'Europe', CY: 'Europe', RU: 'Europe', AM: 'Asia', AZ: 'Asia', GE: 'Asia', KZ: 'Asia' }

let dn = null
try { dn = new Intl.DisplayNames(['en'], { type: 'region' }) } catch {}
const cityOf = (z) => z.split('/').pop().replace(/_/g, ' ')
function continent(cc, zone) {
  if (CONT_FIX[cc]) return CONT_FIX[cc]
  const p = zone.split('/')[0]
  return p === 'America' ? 'Americas' : p === 'Australia' || p === 'Pacific' ? 'Oceania' : p === 'Indian' || p === 'Atlantic' ? 'Africa' : p
}

export const CONTINENTS = ['Asia', 'Europe', 'Africa', 'Americas', 'Oceania']
export const COUNTRIES = RAW.split('\n').map((line) => {
  const [cc, capital, zone] = line.split('|')
  const name = NAME_FIX[cc] || (dn && dn.of(cc)) || cc
  const zones = [{ id: zone, label: capital }].concat((EXTRA[cc] || []).map(([id, label]) => ({ id, label })))
  return { cc, name, capital, zone, zones, multi: zones.length > 1, continent: continent(cc, zone), key: `${name} ${capital} ${cc} ${zones.map((z) => z.label).join(' ')}`.toLowerCase() }
}).sort((a, b) => a.name.localeCompare(b.name))
export const BY_CC = Object.fromEntries(COUNTRIES.map((c) => [c.cc, c]))
export const zoneLabel = (c, zone) => c.zones.find((z) => z.id === zone)?.label || cityOf(zone)

/* ------------------------------------------------ time maths ------------------------------------------------ */
const fmtCache = {}
function dtf(zone) {
  return fmtCache[zone] || (fmtCache[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }))
}
export function partsIn(ts, zone) {
  const o = {}
  for (const p of dtf(zone).formatToParts(new Date(ts))) o[p.type] = p.value
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday }
}
/** offset of the zone from UTC in minutes at instant ts */
export function offsetMin(zone, ts) {
  const p = partsIn(ts, zone)
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000) / 60000)
}
/** wall-clock time in `zone` → UTC instant (handles DST gaps/overlaps by taking the earlier valid instant) */
export function zonedToUtc(y, mo, d, h, mi, zone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let t = guess - offsetMin(zone, guess) * 60000
  const o2 = offsetMin(zone, t)
  t = guess - o2 * 60000
  return t
}
export const fmtOffset = (min) => { const s = min < 0 ? '−' : '+', a = Math.abs(min); return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}` }
export function isDst(zone, ts) {
  const y = new Date(ts).getUTCFullYear(), a = offsetMin(zone, Date.UTC(y, 0, 1)), b = offsetMin(zone, Date.UTC(y, 6, 1))
  return a !== b && offsetMin(zone, ts) === Math.max(a, b)
}
export function zoneAbbr(zone, ts) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(ts)).find((x) => x.type === 'timeZoneName')
    return p && !/^GMT[+−-]/.test(p.value) ? p.value : ''
  } catch { return '' }
}
export const pad2 = (n) => String(n).padStart(2, '0')
export const dateStr = (p) => `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`
/** whole-day difference between two zone-local dates */
export function dayDiff(pa, pb) { return Math.round((Date.UTC(pb.y, pb.mo - 1, pb.d) - Date.UTC(pa.y, pa.mo - 1, pa.d)) / 86400000) }
export function humanDiff(min) {
  if (min === 0) return 'the same time as'
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60
  return `${h ? h + ' h' : ''}${h && m ? ' ' : ''}${m ? m + ' min' : ''} ${min > 0 ? 'ahead of' : 'behind'}`
}
