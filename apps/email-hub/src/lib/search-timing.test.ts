import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { debounceLatest, throttleLatest } from "@/lib/search-timing"

describe("throttleLatest", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("invokes immediately then trailing with the latest args", () => {
    const fn = vi.fn()
    const throttled = throttleLatest(fn, 100)
    throttled("a")
    throttled("b")
    throttled("c")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith("a")
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith("c")
  })

  it("cancel drops a pending trailing call", () => {
    const fn = vi.fn()
    const throttled = throttleLatest(fn, 100)
    throttled("a")
    throttled("b")
    throttled.cancel()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("debounceLatest", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("waits for quiet before invoking with the latest args", () => {
    const fn = vi.fn()
    const debounced = debounceLatest(fn, 200)
    debounced("a")
    vi.advanceTimersByTime(100)
    debounced("b")
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("b")
  })
})
