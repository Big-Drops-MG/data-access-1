import { z } from "zod"

import { emailSchema } from "@workspace/shared"

import { isAllowedSsoEmailDomain } from "@/lib/auth/admin-emails"
import { APP_ROLES } from "@/lib/permissions"

export const staffRoleSchema = z.enum(APP_ROLES)

export const inviteUserBodySchema = z
  .object({
    email: emailSchema,
    role: staffRoleSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isAllowedSsoEmailDomain(value.email)) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Must be a bigdropsmarketing.com address",
      })
    }
  })

export const updateUserRoleBodySchema = z
  .object({
    role: staffRoleSchema,
  })
  .strict()
