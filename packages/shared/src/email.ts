export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function maskEmail(email: string): string {
  const normalised = normaliseEmail(email)
  const at = normalised.lastIndexOf("@")
  if (at <= 0 || at === normalised.length - 1) {
    return normalised
  }

  const local = normalised.slice(0, at)
  const domain = normalised.slice(at + 1)
  return `${local.slice(0, 2)}***@${domain}`
}
