"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { user } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { jobTitleSchema, writeAudit } from "@workspace/shared"

import { getSession } from "@/lib/auth"
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/login/safe-next-path"

export type CompleteOnboardingState = {
  error: string | null
}

export async function completeOnboardingAction(
  _prev: CompleteOnboardingState,
  formData: FormData
): Promise<CompleteOnboardingState> {
  const session = await getSession()
  if (!session) {
    redirect("/login")
  }
  if (!session.twoFactorEnabled) {
    redirect("/login/2fa-setup")
  }
  if (session.jobTitle) {
    redirect(DEFAULT_POST_LOGIN_PATH)
  }

  const parsed = jobTitleSchema.safeParse(formData.get("jobTitle"))
  if (!parsed.success) {
    return { error: "Select a role to continue." }
  }

  const requestId = (await headers()).get("x-request-id")
  await getDb().transaction(async (tx) => {
    await tx
      .update(user)
      .set({ jobTitle: parsed.data, updatedAt: new Date() })
      .where(eq(user.id, session.id))
    await writeAudit(tx, {
      actor: { type: "user", id: session.id },
      action: "user.job_title_set",
      objectType: "user",
      objectId: session.id,
      requestId,
      before: { jobTitle: null },
      after: { jobTitle: parsed.data },
    })
  })

  redirect(DEFAULT_POST_LOGIN_PATH)
}
