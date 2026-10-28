import { z } from "zod"

/** Staff job titles collected on /onboarding (display only; not permission role). */
export const JOB_TITLES = [
  "CEO",
  "CFO",
  "Web Developer",
  "UI/UX Designer",
  "Graphics Designer",
  "Business Development Manager",
  "Content Writer",
] as const

export type JobTitle = (typeof JOB_TITLES)[number]

export const jobTitleSchema = z.enum(JOB_TITLES)

export function isJobTitle(value: unknown): value is JobTitle {
  return jobTitleSchema.safeParse(value).success
}
