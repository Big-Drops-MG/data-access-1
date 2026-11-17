const ACTOR_TYPE_LABELS: Record<string, string> = {
  user: "User",
  api_client: "API client",
  system: "System",
}

export function actorTypeLabel(type: string): string {
  return ACTOR_TYPE_LABELS[type] ?? type
}

/** `domain.create` → `Domain · Create`. */
export function actionLabel(action: string): string {
  const [rawObject, rawVerb, ...rest] = action.split(".")
  if (!rawObject || !rawVerb || rest.length > 0) {
    return titleCaseWords(action.replaceAll(".", " ").replaceAll("_", " "))
  }
  return `${titleCaseWords(rawObject.replaceAll("_", " "))} · ${titleCaseWords(rawVerb.replaceAll("_", " "))}`
}

export function objectTypeLabel(type: string): string {
  return titleCaseWords(type.replaceAll("_", " "))
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
