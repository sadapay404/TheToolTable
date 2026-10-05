/** Pure media command helpers shared by the local clipper and frame trimmer. */
export function buildStreamCopyClipArgs(inputName, outputName, start, end) {
  const from = Number(start)
  const to = Number(end)
  if (!inputName || !outputName) throw new TypeError('Input and output file names are required')
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) {
    throw new RangeError('Choose a valid clip range with an end after the start')
  }

  const fromMs = Math.round(from * 1000)
  const toMs = Math.round(to * 1000)
  if (toMs <= fromMs) throw new RangeError('The clip must be at least one millisecond long')
  const seconds = (ms) => (ms / 1000).toFixed(3)

  // -ss seeks within the input; -t is an output duration (end - start), not an end timestamp.
  return [
    '-ss', seconds(fromMs),
    '-i', inputName,
    '-t', seconds(toMs - fromMs),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-y', outputName,
  ]
}

export function safeMediaExtension(name, fallback = 'mp4') {
  const match = String(name || '').match(/\.([a-z0-9]{1,10})$/i)
  return match ? match[1].toLowerCase() : fallback
}
