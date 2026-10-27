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
