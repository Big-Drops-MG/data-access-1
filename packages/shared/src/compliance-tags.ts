type MergeData = Record<string, string | number | boolean>

export const UNSUBSCRIBE_MERGE_TAG = "unsubscribe_url"
export const POSTAL_ADDRESS_MERGE_TAG = "postal_address"

/**
 * Placeholder stored only so a required unsubscribe merge tag passes the
 * pre-queue check. The send worker replaces it with the signed unsubscribe URL
 * before rendering. It is not a production token.
 */
export const PENDING_UNSUBSCRIBE_MERGE_VALUE =
  "https://example.com/unsubscribe/pending"

export const MESSAGE_ENVIRONMENTS = ["production", "test"] as const

export type MessageEnvironment = (typeof MESSAGE_ENVIRONMENTS)[number]

export function messageEnvironment(
  value: string | null | undefined
): MessageEnvironment {
  return value === "test" ? "test" : "production"
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  )
}

/**
 * Fill compliance merge tags the renderer will substitute, using the sender
 * postal address and a non-production unsubscribe placeholder. Caller-supplied
 * values are kept. The worker overwrites both at render time.
 */
export function fillMissingComplianceMergeData(
  mergeData: MergeData | null | undefined,
  requiredTags: readonly string[],
  postalAddress: string | null | undefined
): MergeData {
  const data: MergeData = { ...(mergeData ?? {}) }
  const required = new Set(requiredTags)
  if (
    required.has(POSTAL_ADDRESS_MERGE_TAG) &&
    isBlank(data[POSTAL_ADDRESS_MERGE_TAG])
  ) {
    const postal = postalAddress?.trim() ?? ""
    if (postal !== "") {
      data[POSTAL_ADDRESS_MERGE_TAG] = postal
    }
  }
  if (
    required.has(UNSUBSCRIBE_MERGE_TAG) &&
    isBlank(data[UNSUBSCRIBE_MERGE_TAG])
  ) {
    data[UNSUBSCRIBE_MERGE_TAG] = PENDING_UNSUBSCRIBE_MERGE_VALUE
  }
  return data
}

/** Values the send worker substitutes for compliance tags at render time. */
export function applyRenderedComplianceMergeData(
  mergeData: MergeData | null | undefined,
  compliance: { unsubscribeUrl: string; postalAddress: string }
): MergeData {
  return {
    ...(mergeData ?? {}),
    [UNSUBSCRIBE_MERGE_TAG]: compliance.unsubscribeUrl,
    [POSTAL_ADDRESS_MERGE_TAG]: compliance.postalAddress,
  }
}
