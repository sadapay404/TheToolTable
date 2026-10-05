const MAX_ROWS = 1002
const MAX_COLUMNS = 50
const MAX_CELL_LENGTH = 10_000
const MAX_FILE_LENGTH = 8 * 1024 * 1024
const DELIMITERS = [',', ';', '\t']

function detectDelimiter(text) {
  const counts = [0, 0, 0]
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') i++
      else quoted = !quoted
    } else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted) {
      const index = DELIMITERS.indexOf(ch)
      if (index >= 0) counts[index]++
    }
  }
  let best = 0
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i
  return DELIMITERS[best]
}

/** Parse a small, bounded CSV/TSV file without allowing giant row or column allocations. */
export function parseCSV(input) {
  if (typeof input !== 'string') throw new TypeError('CSV content must be text.')
  if (input.length > MAX_FILE_LENGTH) throw new Error('Choose a CSV file smaller than 8 MB.')
  const text = input.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(text)
  const rows = []
  let row = [], cell = '', quoted = false, processedRows = 0
  const append = (value) => {
    if (cell.length + value.length > MAX_CELL_LENGTH) throw new Error('A CSV cell is longer than 10,000 characters.')
    cell += value
  }
  const pushCell = () => {
    if (row.length >= MAX_COLUMNS) throw new Error('A CSV row has more than 50 columns.')
    row.push(cell); cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (row.some((value) => value.trim())) rows.push(row)
    row = []; processedRows++
  }

  for (let i = 0; i < text.length && processedRows < MAX_ROWS; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { append('"'); i++ }
        else quoted = false
      } else append(ch)
    } else if (ch === '"' && cell.length === 0) quoted = true
    else if (ch === delimiter) pushCell()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else append(ch)
  }

  if (quoted && processedRows < MAX_ROWS) throw new Error('A CSV field has an unclosed quote.')
  if (processedRows < MAX_ROWS && (cell.length || row.length)) pushRow()
  return rows
}
