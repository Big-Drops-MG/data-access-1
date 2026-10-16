export const token = (name: string) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim()

export const chartSeries = ["chart-1", "chart-2", "chart-3"] as const

export const brand = { navy: "#00173a", cyan: "#07b2d2" } as const
