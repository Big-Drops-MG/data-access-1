import { AppError } from "@workspace/shared"

export const EVERFLOW_DEFAULT_BASE_URL = "https://api.eflow.team/v1"
export const EVERFLOW_HTTP_TIMEOUT_MS = 10_000

export type EverflowOfferCreative = {
  network_offer_creative_id: number
  name: string
  creative_type: string
  creative_status: string
  resource_url: string
}

export type EverflowOfferUrl = {
  network_offer_url_id: number
  name: string
  preview_url: string
}

export type EverflowOfferDetail = {
  network_offer_id: number
  name: string
  offer_status: string
  tracking_url: string | null
  impression_tracking_url: string | null
  redirect_tracking_url: string | null
  subject_lines: string[]
  from_lines: string[]
  creatives: EverflowOfferCreative[]
  urls: EverflowOfferUrl[]
  unsubscribe_url: string | null
  suppression_file_url: string | null
  optizmo_mailer_access_key: string | null
}

type EverflowClientDeps = {
  apiKey?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  now?: () => number
}

type RawEverflowOffer = {
  network_offer_id?: unknown
  name?: unknown
  offer_status?: unknown
  tracking_url?: unknown
  impression_tracking_url?: unknown
  redirect_tracking_url?: unknown
  relationship?: {
    email?: {
      subject_lines?: unknown
      from_lines?: unknown
    }
    email_optout?: {
      suppression_file_link?: unknown
      unsub_link?: unknown
    }
    integrations?: {
      optizmo?: {
        mailer_access_key?: unknown
        optout_link?: unknown
      }
    }
    creatives?: {
      entries?: unknown
    }
    urls?: {
      entries?: unknown
    }
  }
}

function readApiKey(deps: EverflowClientDeps): string {
  const key = (deps.apiKey ?? process.env.EVERFLOW_API_KEY ?? "").trim()
  if (!key) {
    throw AppError.unavailable([
      { path: "everflow", message: "EVERFLOW_API_KEY is not configured" },
    ])
  }
  return key
}

function readBaseUrl(deps: EverflowClientDeps): string {
  const raw = (
    deps.baseUrl ??
    process.env.EVERFLOW_API_BASE_URL ??
    EVERFLOW_DEFAULT_BASE_URL
  ).trim()
  return raw.replace(/\/+$/, "")
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return null
}

function splitLines(value: unknown): string[] {
  if (typeof value !== "string") {
    return []
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function mapCreatives(entries: unknown): EverflowOfferCreative[] {
  if (!Array.isArray(entries)) {
    return []
  }
  const out: EverflowOfferCreative[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const row = entry as Record<string, unknown>
    const id = asNumber(row.network_offer_creative_id)
    if (id === null) {
      continue
    }
    out.push({
      network_offer_creative_id: id,
      name: asString(row.name) ?? "",
      creative_type: asString(row.creative_type) ?? "",
      creative_status: asString(row.creative_status) ?? "",
      resource_url: asString(row.resource_url) ?? "",
    })
  }
  return out
}

function mapUrls(entries: unknown): EverflowOfferUrl[] {
  if (!Array.isArray(entries)) {
    return []
  }
  const out: EverflowOfferUrl[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const row = entry as Record<string, unknown>
    const id = asNumber(row.network_offer_url_id)
    if (id === null) {
      continue
    }
    out.push({
      network_offer_url_id: id,
      name: asString(row.name) ?? "",
      preview_url: asString(row.preview_url) ?? "",
    })
  }
  return out
}

export function normalizeOptizmoMailerAccessKey(raw: string): string {
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split("/").filter(Boolean)
    const last = parts[parts.length - 1]
    return last && last.length > 0 ? last : trimmed
  } catch {
    return trimmed
  }
}

export function mapEverflowOfferPayload(
  payload: RawEverflowOffer
): EverflowOfferDetail {
  const offerId = asNumber(payload.network_offer_id)
  const name = asString(payload.name)
  if (offerId === null || !name) {
    throw AppError.unavailable([
      {
        path: "everflow",
        message: "Offer response was missing required fields",
      },
    ])
  }

  const rel = payload.relationship
  const optizmo = rel?.integrations?.optizmo
  const emailOptout = rel?.email_optout
  const unsubscribe =
    asString(optizmo?.optout_link) ?? asString(emailOptout?.unsub_link)
  const mailerRaw = asString(optizmo?.mailer_access_key)

  return {
    network_offer_id: offerId,
    name,
    offer_status: asString(payload.offer_status) ?? "inactive",
    tracking_url: asString(payload.tracking_url),
    impression_tracking_url: asString(payload.impression_tracking_url),
    redirect_tracking_url: asString(payload.redirect_tracking_url),
    subject_lines: splitLines(rel?.email?.subject_lines),
    from_lines: splitLines(rel?.email?.from_lines),
    creatives: mapCreatives(rel?.creatives?.entries),
    urls: mapUrls(rel?.urls?.entries),
    unsubscribe_url: unsubscribe,
    suppression_file_url: asString(emailOptout?.suppression_file_link),
    optizmo_mailer_access_key: mailerRaw
      ? normalizeOptizmoMailerAccessKey(mailerRaw)
      : null,
  }
}

function everflowFetchFailureMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const withCause = error as {
      message?: unknown
      cause?: { code?: unknown; message?: unknown }
    }
    const causeCode =
      typeof withCause.cause?.code === "string" ? withCause.cause.code : null
    const causeMessage =
      typeof withCause.cause?.message === "string"
        ? withCause.cause.message
        : null
    const message =
      typeof withCause.message === "string" ? withCause.message : null
    const detail = [message, causeCode, causeMessage].filter(Boolean).join(": ")
    if (detail) {
      return `Everflow request failed (${detail})`.slice(0, 240)
    }
  }
  return "Everflow request failed"
}

export async function fetchEverflowOfferById(
  offerId: number,
  deps: EverflowClientDeps = {}
): Promise<EverflowOfferDetail> {
  const apiKey = readApiKey(deps)
  const baseUrl = readBaseUrl(deps)
  const fetchImpl = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EVERFLOW_HTTP_TIMEOUT_MS)

  try {
    const response = await fetchImpl(
      `${baseUrl}/affiliates/offers/${offerId}`,
      {
        method: "GET",
        // Authenticated third-party calls must never use Next fetch caching.
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-Eflow-API-Key": apiKey,
        },
        signal: controller.signal,
      }
    )

    if (response.status === 404) {
      throw AppError.notFound([
        { path: "everflow_offer_id", message: "Offer not found in Everflow" },
      ])
    }

    if (!response.ok) {
      throw AppError.unavailable([
        {
          path: "everflow",
          message: `Everflow request failed (${response.status})`,
        },
      ])
    }

    const payload = (await response.json()) as RawEverflowOffer
    return mapEverflowOfferPayload(payload)
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
    ) {
      throw AppError.unavailable([
        { path: "everflow", message: "Everflow request timed out" },
      ])
    }
    throw AppError.unavailable([
      { path: "everflow", message: everflowFetchFailureMessage(error) },
    ])
  } finally {
    clearTimeout(timeout)
  }
}
