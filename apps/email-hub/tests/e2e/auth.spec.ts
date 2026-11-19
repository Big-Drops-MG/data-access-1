import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

import { TWO_FACTOR_MAX_FAILED_ATTEMPTS } from "../../src/lib/auth/two-factor-policy"
import {
  codeDifferentFrom,
  codeOutsideTotpWindow,
  currentTotp,
  TOTP_STEP_SECONDS,
} from "../../src/lib/e2e/totp"

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3099"

function secret(): string {
  const value = process.env.E2E_AUTH_SECRET
  if (!value) {
    throw new Error("E2E_AUTH_SECRET is not set for the test runner.")
  }
  return value
}

function totpSecret(): string {
  const value = process.env.E2E_TOTP_SECRET
  if (!value) {
    throw new Error("E2E_TOTP_SECRET is not set for the test runner.")
  }
  return value
}

function harnessHeaders(): { authorization: string; origin: string } {
  return {
    authorization: `Bearer ${secret()}`,
    origin: baseURL,
  }
}

async function resetHarness(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/e2e/reset", {
    data: { action: "reset" },
    headers: harnessHeaders(),
  })
  expect(response.ok()).toBeTruthy()
}

function cookieHeader(response: {
  headersArray(): { name: string; value: string }[]
}): string {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .join("\n")
}

async function signIn(
  request: APIRequestContext,
  persona: "login" | "twoFactor" | "lockout"
): Promise<void> {
  const response = await request.post("/api/e2e/sign-in", {
    data: { persona },
    headers: harnessHeaders(),
  })
  expect(response.ok()).toBeTruthy()
  expect(cookieHeader(response).toLowerCase()).toContain("session_token")
}

async function startChallenge(
  request: APIRequestContext,
  persona: "twoFactor" | "lockout"
): Promise<void> {
  const response = await request.post("/api/e2e/sign-in", {
    data: { persona },
    headers: harnessHeaders(),
  })
  expect(response.ok()).toBeTruthy()
  const cookies = cookieHeader(response).toLowerCase()
  expect(cookies).toContain("two_factor")
  expect(cookies).not.toContain("session_token=")
}

async function enterCode(page: Page, code: string): Promise<void> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/two-factor/verify-totp") &&
      response.request().method() === "POST"
  )
  await page.getByTestId("otp-digit-0").click()
  await page.keyboard.type(code)
  await pending
}

async function waitForStableTotpWindow(page: Page): Promise<void> {
  const remaining =
    TOTP_STEP_SECONDS - (Math.floor(Date.now() / 1000) % TOTP_STEP_SECONDS)
  if (remaining < 8) {
    await page.waitForTimeout((remaining + 1) * 1000)
  }
}

test.beforeEach(async ({ request }) => {
  await resetHarness(request)
})

test.describe("scenario 1 login", () => {
  test("loads the login page and rejects a bad test-login secret", async ({
    page,
    request,
  }) => {
    await page.goto("/login")
    await expect(
      page.getByRole("heading", { name: "Team sign in" })
    ).toBeVisible()
    await expect(page.getByTestId("google-sign-in")).toBeVisible()

    const rejected = await request.post("/api/e2e/sign-in", {
      data: { persona: "login" },
      headers: { authorization: "Bearer not-the-secret", origin: baseURL },
    })
    expect(rejected.status()).toBe(404)

    await page.goto("/login?error=sso_failed")
    await expect(page.getByTestId("login-error-alert")).toContainText(
      "Sign-in didn't complete"
    )
  })

  test("establishes a session, opens the dashboard, and signs out", async ({
    page,
  }) => {
    await signIn(page.request, "login")
    const session = await page.request.get("/api/auth/get-session")
    expect(session.ok()).toBeTruthy()
    const body = (await session.json()) as { user?: { email?: string } }
    expect(body.user?.email).toBe(process.env.E2E_LOGIN_EMAIL)

    await page.goto("/dashboard")
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.getByTestId("app-top-bar-user-menu").click()
    const signedOut = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/sign-out") &&
        response.request().method() === "POST"
    )
    await page.getByTestId("app-top-bar-sign-out").click()
    expect((await signedOut).ok()).toBeTruthy()
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })

    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/)
    await expect(
      page.getByRole("heading", { name: "Team sign in" })
    ).toBeVisible()
  })

  test("blocks a protected route with no session", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${baseURL}/dashboard`)
    await expect(page).toHaveURL(/\/login/)
    await context.close()
  })
})

test.describe("scenario 2 two-factor", () => {
  test("requires a valid otplib code and rejects expired, invalid, and replayed codes", async ({
    page,
    browser,
  }) => {
    await startChallenge(page.request, "twoFactor")
    const challengeCookies = await page.context().cookies()

    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/)

    await page.goto("/login/2fa-verify")
    await expect(
      page.getByRole("heading", { name: "Enter your 6-digit code" })
    ).toBeVisible()

    await enterCode(page, codeOutsideTotpWindow(totpSecret()))
    await expect(
      page.getByText("Check your authenticator app and try again.")
    ).toBeVisible()

    await enterCode(page, codeDifferentFrom(currentTotp(totpSecret())))
    await expect(
      page.getByText("Check your authenticator app and try again.")
    ).toBeVisible()

    await waitForStableTotpWindow(page)
    const accepted = currentTotp(totpSecret())
    await enterCode(page, accepted)
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()

    const replay = await browser.newContext()
    await replay.addCookies(challengeCookies)
    const replayed = await replay.request.post(
      "/api/auth/two-factor/verify-totp",
      {
        data: { code: accepted, trustDevice: false },
        headers: { origin: baseURL },
      }
    )
    expect(replayed.ok()).toBeFalsy()
    await replay.close()
  })
})

test.describe("scenario 3 lockout", () => {
  test("locks after the configured failures and rejects a valid code until the lock expires", async ({
    page,
  }) => {
    await startChallenge(page.request, "lockout")
    await page.goto("/login/2fa-verify")

    for (
      let attempt = 0;
      attempt < TWO_FACTOR_MAX_FAILED_ATTEMPTS;
      attempt += 1
    ) {
      await enterCode(page, codeDifferentFrom(currentTotp(totpSecret())))
      await expect(
        page.getByText("Check your authenticator app and try again.")
      ).toBeVisible()
    }

    await page.reload()
    const lockout = page.getByTestId("two-factor-lockout-alert")
    await expect(lockout).toHaveAttribute("data-error-kind", "temporary_lock")
    await expect(lockout).toContainText("Too many wrong codes")
    await expect(lockout).toContainText("15 minutes")
    await expect(page.getByTestId("otp-digit-0")).toBeDisabled()

    const cleared = await page.request.post("/api/e2e/reset", {
      data: { action: "clear-rate-limit", persona: "lockout" },
      headers: harnessHeaders(),
    })
    expect(cleared.ok()).toBeTruthy()

    await waitForStableTotpWindow(page)
    const validWhileLocked = await page.request.post(
      "/api/auth/two-factor/verify-totp",
      {
        data: { code: currentTotp(totpSecret()), trustDevice: false },
        headers: { origin: baseURL },
      }
    )
    expect(validWhileLocked.ok()).toBeFalsy()
    const lockedBody = await validWhileLocked.text()
    expect(lockedBody).toContain("ACCOUNT_TEMPORARILY_LOCKED")

    const expired = await page.request.post("/api/e2e/reset", {
      data: { action: "expire-lockout", persona: "lockout" },
      headers: harnessHeaders(),
    })
    expect(expired.ok()).toBeTruthy()

    await page.goto("/login/2fa-verify")
    await waitForStableTotpWindow(page)
    await enterCode(page, currentTotp(totpSecret()))
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  })
})
