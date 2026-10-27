export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  const { loadServerEnv } = await import("@workspace/shared")
  loadServerEnv("web")
}
