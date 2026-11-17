/**
 * Leading+trailing throttle: runs immediately, then at most once more after
 * `waitMs` with the latest args (good for keydown / input flooding).
 */
export function throttleLatest<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number
): ((...args: TArgs) => void) & { cancel: () => void } {
  let lastInvoke = 0
  let trailingTimer: ReturnType<typeof setTimeout> | null = null
  let pending: TArgs | null = null

  const invoke = (args: TArgs) => {
    lastInvoke = Date.now()
    pending = null
    fn(...args)
  }

  const wrapped = ((...args: TArgs) => {
    pending = args
    const elapsed = Date.now() - lastInvoke
    if (elapsed >= waitMs) {
      if (trailingTimer) {
        clearTimeout(trailingTimer)
        trailingTimer = null
      }
      invoke(args)
      return
    }
    if (trailingTimer) {
      return
    }
    trailingTimer = setTimeout(() => {
      trailingTimer = null
      if (pending) {
        invoke(pending)
      }
    }, waitMs - elapsed)
  }) as ((...args: TArgs) => void) & { cancel: () => void }

  wrapped.cancel = () => {
    if (trailingTimer) {
      clearTimeout(trailingTimer)
      trailingTimer = null
    }
    pending = null
  }

  return wrapped
}

/** Trailing debounce: runs `fn` once after `waitMs` of quiet. */
export function debounceLatest<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number
): ((...args: TArgs) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  const wrapped = ((...args: TArgs) => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }) as ((...args: TArgs) => void) & { cancel: () => void }

  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return wrapped
}
