"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form"
import type { z } from "zod"

import { useUnsavedChanges } from "./use-unsaved-changes"

type AppFormOptions<TFieldValues extends FieldValues> = {
  /** Prompt when leaving a dirty form (default true). */
  unsavedChanges?: boolean
  defaultValues?: DefaultValues<TFieldValues>
} & Omit<
  UseFormProps<TFieldValues>,
  "resolver" | "mode" | "reValidateMode" | "defaultValues"
>

/**
 * React Hook Form + Zod with blur-then-change validation (SD#12.6).
 * Uses the same Zod schema shape as the API where possible.
 */
export function useAppForm<TFieldValues extends FieldValues>(
  schema: z.ZodType<TFieldValues, unknown>,
  options: AppFormOptions<TFieldValues> = {}
): UseFormReturn<TFieldValues> {
  const { unsavedChanges = true, defaultValues, ...formOptions } = options

  const form = useForm<TFieldValues>({
    ...formOptions,
    defaultValues,
    resolver: zodResolver(
      schema as z.ZodType<TFieldValues, TFieldValues>
    ) as Resolver<TFieldValues>,
    mode: "onBlur",
    reValidateMode: "onChange",
  })

  useUnsavedChanges(form.formState.isDirty, unsavedChanges)

  return form
}
