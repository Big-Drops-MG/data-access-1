import { loadServerEnv } from "@workspace/shared"
import { WEB_SERVICE, createLogger, setFallbackLogger } from "@workspace/logger"
import dns from "node:dns"

export async function registerNode(): Promise<void> {
  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first")
  }

  loadServerEnv("web")
  setFallbackLogger(createLogger({ service: WEB_SERVICE }))
}
