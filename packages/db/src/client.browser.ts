function serverOnly(): never {
  throw new Error("@workspace/db/client can only be used on the server.")
}

export function getPool(): never {
  serverOnly()
}

export function getDb(): never {
  serverOnly()
}
