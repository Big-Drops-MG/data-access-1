/**
 * TanStack Query key helpers (SD#12.4).
 * Shape: `[feature, "list" | "detail", …]`.
 */

export type QueryFeature = string

export function listQueryKey(
  feature: QueryFeature,
  filters?: unknown
): readonly [QueryFeature, "list", unknown?] {
  return filters === undefined
    ? ([feature, "list"] as const)
    : ([feature, "list", filters] as const)
}

export function detailQueryKey(
  feature: QueryFeature,
  id: string
): readonly [QueryFeature, "detail", string] {
  return [feature, "detail", id] as const
}
