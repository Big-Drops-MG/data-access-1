const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Reject non-identifier table names before they reach ClickHouse insert. */
export function assertClickHouseTableName(table: string): string {
  if (!TABLE_NAME_RE.test(table)) {
    throw new Error(
      `Invalid ClickHouse table name "${table}". Use a plain identifier (letters, digits, underscore).`
    )
  }
  return table
}
