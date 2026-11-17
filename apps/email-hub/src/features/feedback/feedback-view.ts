export type ComplaintsView = "users" | "domains"

export const COMPLAINTS_VIEWS: ReadonlyArray<{
  value: ComplaintsView
  label: string
  description: string
}> = [
  {
    value: "users",
    label: "Users",
    description: "Per-recipient junk and complaint reports",
  },
  {
    value: "domains",
    label: "Domains",
    description: "Domain and IP reputation from providers",
  },
]

export function parseComplaintsView(value: string | undefined): ComplaintsView {
  if (value === "domains") {
    return "domains"
  }
  return "users"
}
