import { loadServerEnv } from "@workspace/shared"
import { WEB_SERVICE, createLogger, setFallbackLogger } from "@workspace/logger"

/**
 * Node-only instrumentation. Keep free of Edge-unsupported APIs.
 * IPv4 preference is set via `node --dns-result-order=ipv4first` in package scripts
 * (and NODE_OPTIONS in Docker), not here — Next also loads instrumentation for Edge.
 */
export async function registerNode(): Promise<void> {
  loadServerEnv("web")
  setFallbackLogger(createLogger({ service: WEB_SERVICE }))
}
