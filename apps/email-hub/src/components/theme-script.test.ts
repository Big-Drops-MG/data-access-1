import { describe, expect, it } from "vitest"

import {
  parseThemeChoice,
  THEME_STORAGE_KEY,
  themeBootScript,
} from "./theme-script"

describe("parseThemeChoice", () => {
  it("keeps light, dark, and system", () => {
    expect(parseThemeChoice("light")).toBe("light")
    expect(parseThemeChoice("dark")).toBe("dark")
    expect(parseThemeChoice("system")).toBe("system")
  })

  it("falls back to system for missing or unknown values", () => {
    expect(parseThemeChoice(null)).toBe("system")
    expect(parseThemeChoice(undefined)).toBe("system")
    expect(parseThemeChoice("blue")).toBe("system")
  })
})

describe("themeBootScript", () => {
  it("reads the same storage key the provider writes", () => {
    expect(themeBootScript).toContain(JSON.stringify(THEME_STORAGE_KEY))
    expect(themeBootScript).toContain("colorScheme")
    expect(themeBootScript).not.toContain("</")
  })
})
