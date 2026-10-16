export type SessionUser = {
  id: string
  email: string
  name: string
  role: "viewer" | "operator" | "admin"
}

export async function getSession(): Promise<SessionUser | null> {
  return null
}
