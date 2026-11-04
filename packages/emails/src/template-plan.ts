export const RENDER_TIMEOUT_MS = 5_000

export const MAX_TEMPLATE_SOURCE_LENGTH = 500_000

export const ALLOWED_TEMPLATE_MODULES = ["@react-email/components"] as const

export const ALLOWED_TEMPLATE_COMPONENTS = [
  "Html",
  "Head",
  "Body",
  "Container",
  "Section",
  "Row",
  "Column",
  "Text",
  "Heading",
  "Button",
  "Link",
  "Img",
  "Preview",
] as const

export type AllowedTemplateComponent =
  (typeof ALLOWED_TEMPLATE_COMPONENTS)[number]

export type IrProps = Record<string, string | number | boolean>

export type IrNode =
  | { k: "el"; c: AllowedTemplateComponent; p: IrProps; ch: IrNode[] }
  | { k: "tx"; v: string }
  | { k: "mg"; n: string }

export const MERGE_TAG_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export function isAllowedComponent(
  name: string
): name is AllowedTemplateComponent {
  return (ALLOWED_TEMPLATE_COMPONENTS as readonly string[]).includes(name)
}
