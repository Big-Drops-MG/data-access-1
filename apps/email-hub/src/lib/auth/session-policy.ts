/** SD#14.1 — server-side session lifetimes. */
export const SESSION_ABSOLUTE_SECONDS = 60 * 60 * 12
export const SESSION_IDLE_SECONDS = 60 * 60 * 2
/** Refresh idle expiry when the session is used (Better Auth `updateAge`). */
export const SESSION_UPDATE_AGE_SECONDS = 60 * 5

export function isSessionPastAbsoluteLimit(
  createdAt: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() - createdAt.getTime() > SESSION_ABSOLUTE_SECONDS * 1000
}

/** Hard stop: createdAt + 12h. */
export function absoluteSessionExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_ABSOLUTE_SECONDS * 1000)
}

/**
 * Cap a proposed idle expiry so it never exceeds the absolute 12h lifetime
 * (SD#14.1). Used on session create/update so sliding idle cannot extend past absolute.
 */
export function clampSessionExpiresAt(
  createdAt: Date,
  proposedExpiresAt: Date
): Date {
  const absolute = absoluteSessionExpiresAt(createdAt)
  return proposedExpiresAt.getTime() <= absolute.getTime()
    ? proposedExpiresAt
    : absolute
}
