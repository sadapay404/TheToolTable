/** Own an object URL for a single loaded source and revoke it exactly once when replaced. */
export function createObjectUrlResource(file, urlApi = globalThis.URL) {
  if (!file || typeof urlApi?.createObjectURL !== 'function' || typeof urlApi?.revokeObjectURL !== 'function') {
    throw new TypeError('Object URLs are not available in this browser')
  }
  const url = urlApi.createObjectURL(file)
  let released = false
  return {
    url,
    release() {
      if (released) return false
      released = true
      urlApi.revokeObjectURL(url)
      return true
    },
    get released() { return released },
  }
}

/** Wait for an image/video element to load while exposing a cancellation hook for rapid file changes. */
export function waitForMediaElement(element, readyEvent, url) {
  let cancel
  const promise = new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      element.removeEventListener(readyEvent, onReady)
      element.removeEventListener('error', onError)
      resolve(result)
    }
    const onReady = () => finish({ ok: true })
    const onError = () => finish({ error: 'This browser could not decode that file. Try a common MP4, WebM, JPEG, or PNG.' })
    cancel = () => finish({ cancelled: true })
    element.addEventListener(readyEvent, onReady)
    element.addEventListener('error', onError)
    element.src = url
  })
  return { promise, cancel: () => cancel?.() }
}

export function releaseMediaElement(element) {
  if (!element) return
  try { element.pause?.(); element.removeAttribute('src'); element.load?.() } catch {}
}
