import { beforeEach, describe, expect, it, vi } from "vitest"

const apiJson = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api-client", () => ({
  apiJson,
  isApiError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "status" in error),
}))

import {
  createApiClient,
  disableApiClient,
  fetchApiClientsList,
  rotateApiClientSecret,
} from "./api"

describe("api-clients feature api", () => {
  beforeEach(() => {
    apiJson.mockReset()
  })

  it("lists clients from the admin endpoint", async () => {
    apiJson.mockResolvedValue({ api_clients: [] })
    await fetchApiClientsList()
    expect(apiJson).toHaveBeenCalledWith("/api/admin/api-clients")
  })

  it("creates a client with scopes and optional allowlist", async () => {
    apiJson.mockResolvedValue({ id: "1", secret: "s" })
    await createApiClient({
      name: "Arohaa",
      scopes: ["arohaa:webhook"],
      ip_allowlist: ["203.0.113.10"],
    })
    expect(apiJson).toHaveBeenCalledWith(
      "/api/admin/api-clients",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Arohaa",
          scopes: ["arohaa:webhook"],
          ip_allowlist: ["203.0.113.10"],
        }),
      })
    )
  })

  it("rotates and disables by id", async () => {
    apiJson.mockResolvedValue({})
    await rotateApiClientSecret("019a0000-0000-7000-8000-0000000000aa")
    await disableApiClient("019a0000-0000-7000-8000-0000000000aa")
    expect(apiJson).toHaveBeenNthCalledWith(
      1,
      "/api/admin/api-clients/019a0000-0000-7000-8000-0000000000aa/rotate",
      expect.objectContaining({ method: "POST" })
    )
    expect(apiJson).toHaveBeenNthCalledWith(
      2,
      "/api/admin/api-clients/019a0000-0000-7000-8000-0000000000aa/disable",
      expect.objectContaining({ method: "POST" })
    )
  })
})
