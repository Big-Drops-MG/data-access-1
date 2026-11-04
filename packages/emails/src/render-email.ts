import { z } from "zod"

import { compileTemplateSource } from "./compile-template.js"
import { runWorkerJob, startRenderDeadline } from "./render-worker-host.js"
import type { IrNode, IrProps } from "./template-plan.js"
import { TemplateRenderError } from "./template-render-error.js"

export { RENDER_TIMEOUT_MS } from "./template-plan.js"
export {
  ALLOWED_TEMPLATE_COMPONENTS,
  ALLOWED_TEMPLATE_MODULES,
} from "./template-plan.js"
export {
  TEMPLATE_RENDER_ERROR_CODES,
  TemplateRenderError,
  type TemplateRenderErrorCode,
} from "./template-render-error.js"

const mergeValueSchema = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
])

const renderInputSchema = z
  .object({
    source: z.string().max(500_000),
    subject: z.string().max(998).optional(),
    mergeData: z
      .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), mergeValueSchema)
      .optional(),
    unsubscribeUrl: z.string().max(2_000),
    postalAddress: z.string().max(500),
  })
  .strict()

export type RenderEmailInput = z.input<typeof renderInputSchema>

export type RenderedEmail = {
  html: string
  text: string
  subject: string
  unsubscribeUrl: string
}

const mergeTag = () => /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export async function renderEmailTemplate(
  input: RenderEmailInput
): Promise<RenderedEmail> {
  const deadline = startRenderDeadline()
  const parsed = renderInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new TemplateRenderError("invalid_input", "Render input is invalid")
  }
  const source = parsed.data.source.trim()
  if (source === "") {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template source is empty"
    )
  }
  const unsubscribeUrl = assertUnsubscribeUrl(parsed.data.unsubscribeUrl)
  const postalAddress = assertPostalAddress(parsed.data.postalAddress)
  const mergeData = stringifyMerge(parsed.data.mergeData ?? {})
  const tree = compileTemplateSource(source)
  const missing = missingTags(tree, parsed.data.subject ?? "", mergeData)
  if (missing.length > 0) {
    throw new TemplateRenderError(
      "merge_data",
      `Missing merge tags: ${missing.join(", ")}`
    )
  }
  const substituted = collapseText(substitute(tree, mergeData))
  const withFooter = appendFooter(substituted, unsubscribeUrl, postalAddress)
  const subject = applySubject(parsed.data.subject ?? "", mergeData)
  if (deadline.expired()) {
    throw new TemplateRenderError(
      "timeout",
      `Rendering exceeded ${String(deadline.timeoutMs)}ms`
    )
  }
  const rendered = await runWorkerJob(
    { kind: "render", tree: withFooter },
    deadline
  )
  if (
    rendered.html.trim() === "" ||
    rendered.text.trim() === "" ||
    !rendered.html.includes(unsubscribeUrl) ||
    !rendered.text.includes(unsubscribeUrl) ||
    !rendered.text.includes(postalAddress)
  ) {
    throw new TemplateRenderError("render_failed", "Render failed")
  }
  if (postalAddress.includes("<") && rendered.html.includes(postalAddress)) {
    throw new TemplateRenderError("render_failed", "Render failed")
  }
  return {
    html: rendered.html,
    text: rendered.text,
    subject,
    unsubscribeUrl,
  }
}

function assertUnsubscribeUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    throw new TemplateRenderError(
      "compliance",
      "Unsubscribe URL and postal address are required"
    )
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new TemplateRenderError(
      "compliance",
      "Unsubscribe URL must be an http(s) URL"
    )
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TemplateRenderError(
      "compliance",
      "Unsubscribe URL must be an http(s) URL"
    )
  }
  return url.toString()
}

function assertPostalAddress(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    throw new TemplateRenderError(
      "compliance",
      "Unsubscribe URL and postal address are required"
    )
  }
  if (hasControlCharacter(trimmed)) {
    throw new TemplateRenderError(
      "compliance",
      "Postal address contains invalid characters"
    )
  }
  return trimmed
}

function stringifyMerge(
  data: Record<string, string | number | boolean>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    out[key] = String(value)
  }
  return out
}

function missingTags(
  node: IrNode,
  subject: string,
  data: Record<string, string>
): string[] {
  const names = new Set<string>()
  collectTags(node, names)
  for (const name of tagNames(subject)) {
    names.add(name)
  }
  return [...names]
    .filter((name) => {
      const value = data[name]
      return value === undefined || value.trim() === ""
    })
    .sort()
}

function collectTags(node: IrNode, names: Set<string>): void {
  if (node.k === "mg") {
    names.add(node.n)
    return
  }
  if (node.k === "tx") {
    return
  }
  for (const value of Object.values(node.p)) {
    if (typeof value === "string") {
      for (const name of tagNames(value)) {
        names.add(name)
      }
    }
  }
  for (const child of node.ch) {
    collectTags(child, names)
  }
}

function tagNames(value: string): string[] {
  const names: string[] = []
  const pattern = mergeTag()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    const name = match[1]
    if (name) {
      names.push(name)
    }
  }
  return names
}

function substitute(node: IrNode, data: Record<string, string>): IrNode {
  if (node.k === "tx") {
    return node
  }
  if (node.k === "mg") {
    return { k: "tx", v: requiredTag(node.n, data) }
  }
  const props: IrProps = {}
  for (const [key, value] of Object.entries(node.p)) {
    if (typeof value !== "string") {
      props[key] = value
      continue
    }
    const filled = fillString(value, data)
    if (key === "href" || key === "src") {
      assertLink(filled, key)
    }
    props[key] = filled
  }
  return {
    k: "el",
    c: node.c,
    p: props,
    ch: node.ch.map((child) => substitute(child, data)),
  }
}

function fillString(value: string, data: Record<string, string>): string {
  return value.replace(mergeTag(), (_full, name: string) =>
    requiredTag(name, data)
  )
}

function requiredTag(name: string, data: Record<string, string>): string {
  const value = data[name]
  if (value === undefined || value.trim() === "") {
    throw new TemplateRenderError("merge_data", `Missing merge tag ${name}`)
  }
  return value
}

function assertLink(value: string, kind: "href" | "src"): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TemplateRenderError(
      "merge_data",
      `Merged ${kind} is not an allowed URL`
    )
  }
  const protocol = url.protocol
  const allowed =
    protocol === "https:" ||
    protocol === "http:" ||
    (kind === "href" && protocol === "mailto:")
  if (!allowed) {
    throw new TemplateRenderError(
      "merge_data",
      `Merged ${kind} is not an allowed URL`
    )
  }
}

function collapseText(node: IrNode): IrNode {
  if (node.k !== "el") {
    return node
  }
  const children: IrNode[] = []
  for (const child of node.ch.map((entry) => collapseText(entry))) {
    const previous = children[children.length - 1]
    if (child.k === "tx" && previous?.k === "tx") {
      children[children.length - 1] = { k: "tx", v: previous.v + child.v }
      continue
    }
    children.push(child)
  }
  return { ...node, ch: children }
}

function applySubject(subject: string, data: Record<string, string>): string {
  return fillString(subject, data)
    .replace(/[\r\n]+/g, " ")
    .trim()
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

function appendFooter(tree: IrNode, url: string, address: string): IrNode {
  const footer: IrNode = {
    k: "el",
    c: "Section",
    p: {},
    ch: [
      {
        k: "el",
        c: "Text",
        p: {},
        ch: [
          { k: "tx", v: "Unsubscribe: " },
          {
            k: "el",
            c: "Link",
            p: { href: url },
            ch: [{ k: "tx", v: url }],
          },
        ],
      },
      { k: "el", c: "Text", p: {}, ch: [{ k: "tx", v: address }] },
    ],
  }
  if (tree.k === "el" && tree.c === "Html") {
    let sawBody = false
    const children = tree.ch.map((child) => {
      if (child.k === "el" && child.c === "Body") {
        sawBody = true
        return { ...child, ch: [...child.ch, footer] }
      }
      return child
    })
    if (sawBody) {
      return { ...tree, ch: children }
    }
  }
  if (tree.k === "el" && tree.c === "Body") {
    return { ...tree, ch: [...tree.ch, footer] }
  }
  return {
    k: "el",
    c: "Html",
    p: {},
    ch: [
      { k: "el", c: "Head", p: {}, ch: [] },
      { k: "el", c: "Body", p: {}, ch: [tree, footer] },
    ],
  }
}
