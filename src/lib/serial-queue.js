/** Create a promise queue that guarantees one job at a time and survives rejected jobs. */
export function createSerialQueue() {
  let queue = Promise.resolve()
  return function enqueue(job) {
    if (typeof job !== 'function') return Promise.reject(new TypeError('Queued job must be a function'))
    const task = queue.then(job)
    queue = task.then(() => undefined, () => undefined)
    return task
  }
}
