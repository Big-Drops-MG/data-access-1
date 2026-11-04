/**
 * Extract required merge tag names from template subject/source (SD#9.3 / T-048).
 * Matches `{{tag_name}}` tokens; names are `[A-Za-z_][A-Za-z0-9_]*`.
 */

const MERGE_TAG_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** Unique merge tag names in first-seen order from one or more source strings. */
export function extractMergeTagNames(...sources: string[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const source of sources) {
    MERGE_TAG_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = MERGE_TAG_RE.exec(source)) !== null) {
      const name = match[1]
      if (!name || seen.has(name)) {
        continue
      }
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

/**
 * Build `template_version.merge_tags` jsonb (object form).
 * Values are `"string"` so send-time `requiredMergeTagNames` reads Object.keys.
 */
export function buildMergeTagsRecord(
  ...sources: string[]
): Record<string, "string"> {
  const record: Record<string, "string"> = {}
  for (const name of extractMergeTagNames(...sources)) {
    record[name] = "string"
  }
  return record
}
