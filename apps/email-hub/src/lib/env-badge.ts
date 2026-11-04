/** True when this deploy should show the yellow DEV badge (hidden in prod). */
export function isDevEnvironmentBadgeVisible(
  emailhubEnv: string | undefined = process.env.EMAILHUB_ENV,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  if (emailhubEnv === "prod") {
    return false
  }
  if (emailhubEnv === "dev") {
    return true
  }
  return nodeEnv !== "production"
}
