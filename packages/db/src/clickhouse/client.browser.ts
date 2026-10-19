function serverOnly(): never {
  throw new Error("@workspace/db/clickhouse can only be used on the server.")
}

export function getClickHouseClient(): never {
  serverOnly()
}

export async function closeClickHouseClient(): Promise<never> {
  serverOnly()
}

export async function clickhouseQuery(): Promise<never> {
  serverOnly()
}

export async function clickhouseCommand(): Promise<never> {
  serverOnly()
}

export async function clickhouseInsert(): Promise<never> {
  serverOnly()
}

export function createClickHouseClientFromUrl(): never {
  serverOnly()
}
