export const UNSUBSCRIBE_VIEWS = [
  {
    value: "list",
    label: "List",
    description: "People who opted out via Hub unsubscribe",
  },
  {
    value: "settings",
    label: "Settings",
    description: "Logo and custom domain for the public unsubscribe page",
  },
] as const

export type UnsubscribeView = (typeof UNSUBSCRIBE_VIEWS)[number]["value"]

export function parseUnsubscribeView(
  value: string | null | undefined
): UnsubscribeView {
  if (value === "settings") {
    return "settings"
  }
  return "list"
}
