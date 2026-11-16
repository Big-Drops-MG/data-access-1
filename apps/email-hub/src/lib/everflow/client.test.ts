import { describe, expect, it, vi } from "vitest"

import {
  mapEverflowOfferPayload,
  normalizeOptizmoMailerAccessKey,
  fetchEverflowOfferById,
} from "./client"

describe("normalizeOptizmoMailerAccessKey", () => {
  it("extracts the path segment from affiliate access URLs", () => {
    expect(
      normalizeOptizmoMailerAccessKey(
        "https://www.affiliateaccesskey.com/m-tqcj-w38-abc"
      )
    ).toBe("m-tqcj-w38-abc")
  })

  it("keeps raw keys unchanged", () => {
    expect(normalizeOptizmoMailerAccessKey("plain-key")).toBe("plain-key")
  })
})

describe("mapEverflowOfferPayload", () => {
  it("maps verified Everflow field names for offer 2049 shape", () => {
    const mapped = mapEverflowOfferPayload({
      network_offer_id: 2049,
      name: "Quotifii",
      offer_status: "active",
      tracking_url: "https://track.example/x/",
      impression_tracking_url: "",
      redirect_tracking_url: "https://track.example/r/",
      relationship: {
        email: {
          subject_lines: "Subject A\n\nSubject B\n",
          from_lines: "From A\nFrom B",
        },
        email_optout: {
          suppression_file_link: "",
          unsub_link: "",
        },
        integrations: {
          optizmo: {
            mailer_access_key:
              "https://www.affiliateaccesskey.com/m-tqcj-w38-abc",
            optout_link: "https://unsub.example/o",
          },
        },
        creatives: {
          entries: [
            {
              network_offer_creative_id: 1,
              name: "CR1",
              creative_type: "html",
              creative_status: "active",
              resource_url: "",
              html_code: "<html></html>",
            },
          ],
        },
        urls: {
          entries: [
            {
              network_offer_url_id: 10,
              name: "Default",
              preview_url: "",
            },
          ],
        },
      },
    })

    expect(mapped).toEqual({
      network_offer_id: 2049,
      name: "Quotifii",
      offer_status: "active",
      tracking_url: "https://track.example/x/",
      impression_tracking_url: null,
      redirect_tracking_url: "https://track.example/r/",
      subject_lines: ["Subject A", "Subject B"],
      from_lines: ["From A", "From B"],
      creatives: [
        {
          network_offer_creative_id: 1,
          name: "CR1",
          creative_type: "html",
          creative_status: "active",
          resource_url: "",
        },
      ],
      urls: [
        {
          network_offer_url_id: 10,
          name: "Default",
          preview_url: "",
        },
      ],
      unsubscribe_url: "https://unsub.example/o",
      suppression_file_url: null,
      optizmo_mailer_access_key: "m-tqcj-w38-abc",
    })
  })
})

describe("fetchEverflowOfferById", () => {
  it("calls the affiliate offer endpoint with the API key header", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        network_offer_id: 2049,
        name: "Quotifii",
        offer_status: "active",
        tracking_url: "https://track.example/x/",
        relationship: {},
      })
    )

    const result = await fetchEverflowOfferById(2049, {
      apiKey: "test-key",
      baseUrl: "https://api.eflow.team/v1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.eflow.team/v1/affiliates/offers/2049",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Eflow-API-Key": "test-key",
        }),
      })
    )
    expect(result.network_offer_id).toBe(2049)
  })

  it("maps 404 to not_found", async () => {
    await expect(
      fetchEverflowOfferById(1, {
        apiKey: "test-key",
        fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })
})
