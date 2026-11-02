import { parse } from "@babel/parser"

import {
  ALLOWED_TEMPLATE_MODULES,
  isAllowedComponent,
  type AllowedTemplateComponent,
  type IrNode,
  type IrProps,
} from "./template-plan.js"
import { TemplateRenderError } from "./template-render-error.js"

const MAX_NODES = 2_000
const MAX_DEPTH = 32
const MERGE_MARK = "\uE000"
const ALLOWED_MODULE: string = ALLOWED_TEMPLATE_MODULES[0]

const COMPONENT_PROPS: Record<AllowedTemplateComponent, readonly string[]> = {
  Html: [],
  Head: [],
  Body: [],
  Container: [],
  Section: [],
  Row: [],
  Column: [],
  Text: [],
  Heading: ["as"],
  Button: ["href"],
  Link: ["href"],
  Img: ["src", "alt", "width", "height"],
  Preview: [],
}

const HTML_TAGS = new Set([
  "p",
  "div",
  "span",
  "br",
  "a",
  "strong",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "img",
  "ul",
  "ol",
  "li",
])

const HTML_ATTRS: Record<string, readonly string[]> = {
  a: ["href"],
  img: ["src", "alt", "width", "height"],
  p: [],
  div: [],
  span: [],
  br: [],
  strong: [],
  em: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  ul: [],
  ol: [],
  li: [],
}

type Ast = {
  type: string
  [key: string]: unknown
}

type HtmlFrame = {
  tag: string
  props: IrProps
  children: IrNode[]
}

export function compileTemplateSource(source: string): IrNode {
  if (isModuleSource(source)) {
    return limitTree(compileTsx(source))
  }
  return limitTree(compileLegacyBody(source))
}

function isModuleSource(source: string): boolean {
  return (
    /^\s*(import|export)\b/m.test(source) ||
    /\brequire\s*\(/.test(source) ||
    /\bimport\s*\(/.test(source)
  )
}

function compileTsx(source: string): IrNode {
  const embedded = embedMergeTags(source)
  let file: Ast
  try {
    file = parse(embedded, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: false,
      sourceFilename: "template",
      ranges: false,
      tokens: false,
    }) as unknown as Ast
  } catch {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template syntax is invalid"
    )
  }

  const program = child(file, "program")
  const statements = array(program, "body")
  if (!statements) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template syntax is invalid"
    )
  }

  let cursor = 0
  const imported = new Set<string>()
  const first = statements[0]
  if (first?.type === "ImportDeclaration") {
    collectImport(first, imported)
    cursor = 1
  }
  if (statements.length !== cursor + 1) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template must be one default function"
    )
  }
  const exported = statements[cursor]
  if (!exported || exported.type !== "ExportDefaultDeclaration") {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template must default-export a function"
    )
  }
  const fn = child(exported, "declaration")
  if (!fn || fn.type !== "FunctionDeclaration") {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template must default-export a function"
    )
  }
  if (fn.async === true || fn.generator === true) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template function cannot be async or a generator"
    )
  }
  const params = array(fn, "params")
  if (!params || params.length > 0) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template function cannot take parameters"
    )
  }
  const body = child(fn, "body")
  const block = body ? array(body, "body") : undefined
  if (!block || block.length !== 1 || block[0]?.type !== "ReturnStatement") {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template function must return one element"
    )
  }
  const returned = child(block[0], "argument")
  if (!returned) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template function must return one element"
    )
  }
  return jsxToIr(returned, imported, 1)
}

function collectImport(node: Ast, imported: Set<string>): void {
  const source = child(node, "source")
  const specifier = source ? stringValue(source, "value") : undefined
  if (!specifier || specifier !== ALLOWED_MODULE) {
    throw new TemplateRenderError(
      "forbidden_import",
      `Import is not allowed: ${moduleLabel(specifier)}`
    )
  }
  const specifiers = array(node, "specifiers")
  if (!specifiers || specifiers.length === 0) {
    throw new TemplateRenderError(
      "forbidden_import",
      "Import is not allowed: empty import"
    )
  }
  for (const spec of specifiers) {
    if (spec.type !== "ImportSpecifier") {
      throw new TemplateRenderError(
        "forbidden_import",
        "Only named imports from @react-email/components are allowed"
      )
    }
    const importedName = identifierName(child(spec, "imported"))
    const localName = identifierName(child(spec, "local"))
    if (!importedName || !isAllowedComponent(importedName)) {
      throw new TemplateRenderError(
        "forbidden_import",
        `Component is not allowed: ${importedName ?? "unknown"}`
      )
    }
    if (localName !== importedName) {
      throw new TemplateRenderError(
        "forbidden_import",
        "Import aliases are not allowed"
      )
    }
    imported.add(importedName)
  }
}

function jsxToIr(node: Ast, imported: Set<string>, depth: number): IrNode {
  if (depth > MAX_DEPTH) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template is nested too deeply"
    )
  }
  if (node.type === "JSXFragment") {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template fragments are not allowed"
    )
  }
  if (node.type !== "JSXElement") {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template must return an element"
    )
  }
  const opening = child(node, "openingElement")
  const nameNode = opening ? child(opening, "name") : undefined
  const name =
    nameNode?.type === "JSXIdentifier"
      ? stringValue(nameNode, "name")
      : undefined
  if (!name || !isAllowedComponent(name) || !imported.has(name)) {
    throw new TemplateRenderError(
      "unsupported_source",
      `Component was not imported: ${name ?? "unknown"}`
    )
  }
  const props = jsxProps(opening, name)
  const children: IrNode[] = []
  for (const childNode of array(node, "children") ?? []) {
    children.push(...jsxChild(childNode, imported, depth + 1))
  }
  return { k: "el", c: name, p: props, ch: children }
}

function jsxProps(
  opening: Ast | undefined,
  component: AllowedTemplateComponent
): IrProps {
  const props: IrProps = {}
  const allowed = COMPONENT_PROPS[component]
  for (const attr of array(opening, "attributes") ?? []) {
    if (attr.type !== "JSXAttribute") {
      throw new TemplateRenderError(
        "unsupported_source",
        "Unsupported JSX attribute"
      )
    }
    const attrName = child(attr, "name")
    const key =
      attrName?.type === "JSXIdentifier"
        ? stringValue(attrName, "name")
        : undefined
    if (!key || !allowed.includes(key)) {
      throw new TemplateRenderError(
        "unsupported_source",
        `Attribute is not allowed: ${key ?? "unknown"}`
      )
    }
    props[key] = jsxPropValue(attr, key)
  }
  if (component === "Img" && typeof props.src !== "string") {
    throw new TemplateRenderError("unsupported_source", "Img requires src")
  }
  return props
}

function jsxPropValue(attr: Ast, key: string): string | number | boolean {
  const value = child(attr, "value")
  if (!value) {
    throw new TemplateRenderError(
      "unsupported_source",
      `Attribute is not allowed: ${key}`
    )
  }
  if (value.type === "StringLiteral") {
    return literalProp(key, stringValue(value, "value") ?? "")
  }
  if (value.type !== "JSXExpressionContainer") {
    throw new TemplateRenderError(
      "unsupported_source",
      `Attribute is not allowed: ${key}`
    )
  }
  const expression = child(value, "expression")
  if (!expression) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Unsupported JSX expression"
    )
  }
  if (expression.type === "StringLiteral") {
    return literalProp(key, stringValue(expression, "value") ?? "")
  }
  if (
    expression.type === "NumericLiteral" &&
    typeof expression.value === "number"
  ) {
    return expression.value
  }
  if (
    expression.type === "BooleanLiteral" &&
    typeof expression.value === "boolean"
  ) {
    return expression.value
  }
  throw new TemplateRenderError(
    "unsupported_source",
    "Unsupported JSX expression"
  )
}

function jsxChild(node: Ast, imported: Set<string>, depth: number): IrNode[] {
  if (node.type === "JSXText") {
    const value = stringValue(node, "value") ?? ""
    if (value.trim() === "") {
      return []
    }
    return nodesFromMarked(value)
  }
  if (node.type === "JSXElement") {
    return [jsxToIr(node, imported, depth)]
  }
  if (node.type === "JSXExpressionContainer") {
    const expression = child(node, "expression")
    if (expression?.type === "StringLiteral") {
      return nodesFromMarked(stringValue(expression, "value") ?? "")
    }
    throw new TemplateRenderError(
      "unsupported_source",
      "Unsupported JSX expression"
    )
  }
  if (node.type === "JSXSpreadChild") {
    throw new TemplateRenderError(
      "unsupported_source",
      "Unsupported JSX spread"
    )
  }
  throw new TemplateRenderError("unsupported_source", "Unsupported JSX child")
}

function compileLegacyBody(source: string): IrNode {
  if (looksLikeScript(source)) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template source is not an email document"
    )
  }
  if (forbiddenHtml(source)) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template HTML contains a forbidden tag or attribute"
    )
  }
  const children = source.includes("<")
    ? parseHtml(source)
    : textToNodes(decodeHtml(source))
  return {
    k: "el",
    c: "Html",
    p: {},
    ch: [
      { k: "el", c: "Head", p: {}, ch: [] },
      {
        k: "el",
        c: "Body",
        p: {},
        ch: [
          {
            k: "el",
            c: "Container",
            p: {},
            ch: [
              {
                k: "el",
                c: "Section",
                p: {},
                ch: children,
              },
            ],
          },
        ],
      },
    ],
  }
}

function looksLikeScript(source: string): boolean {
  return (
    /^\s*(while|for|do|if|switch|try|class|function|const|let|var|return|throw|await|async|import)\b/.test(
      source
    ) ||
    /\b(eval|Function|require|process|globalThis|global|fetch|XMLHttpRequest|WebSocket)\s*(\.|[(])/.test(
      source
    ) ||
    /\bnode:(?:fs|http|https|net|child_process)\b/.test(source)
  )
}

function forbiddenHtml(source: string): boolean {
  return (
    /<\s*\/?\s*(script|iframe|object|embed|link|meta|form|svg|math|style|base)\b/i.test(
      source
    ) ||
    /\son[a-z]+\s*=/i.test(source) ||
    /javascript\s*:/i.test(source) ||
    /\sstyle\s*=/i.test(source)
  )
}

function parseHtml(source: string): IrNode[] {
  const roots: IrNode[] = []
  const stack: HtmlFrame[] = []
  let index = 0
  let text = ""

  const flush = (): void => {
    if (text === "") {
      return
    }
    const nodes = textToNodes(decodeHtml(text))
    text = ""
    const frame = stack[stack.length - 1]
    if (frame) {
      frame.children.push(...nodes)
      return
    }
    roots.push(...nodes)
  }

  while (index < source.length) {
    if (source[index] !== "<") {
      text += source[index]
      index += 1
      continue
    }
    if (source.startsWith("<!--", index)) {
      flush()
      const end = source.indexOf("-->", index + 4)
      index = end === -1 ? source.length : end + 3
      continue
    }
    flush()
    const end = source.indexOf(">", index + 1)
    if (end === -1) {
      throw new TemplateRenderError(
        "unsupported_source",
        "Template HTML is invalid"
      )
    }
    const raw = source.slice(index + 1, end).trim()
    index = end + 1
    if (raw.startsWith("/")) {
      const tag = raw.slice(1).trim().toLowerCase()
      const frame = stack.pop()
      if (!frame || frame.tag !== tag) {
        throw new TemplateRenderError(
          "unsupported_source",
          "Template HTML is invalid"
        )
      }
      pushElement(stack, roots, htmlElement(frame))
      continue
    }
    const selfClosing = raw.endsWith("/")
    const body = selfClosing ? raw.slice(0, -1).trim() : raw
    const parsed = parseStartTag(body)
    if (!HTML_TAGS.has(parsed.tag)) {
      throw new TemplateRenderError(
        "unsupported_source",
        `HTML tag is not allowed: ${parsed.tag}`
      )
    }
    if (selfClosing || parsed.tag === "br" || parsed.tag === "img") {
      pushElement(stack, roots, htmlLeaf(parsed.tag, parsed.props))
      continue
    }
    if (stack.length >= MAX_DEPTH) {
      throw new TemplateRenderError(
        "unsupported_source",
        "Template is nested too deeply"
      )
    }
    stack.push({ tag: parsed.tag, props: parsed.props, children: [] })
  }
  flush()
  if (stack.length > 0) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template HTML is invalid"
    )
  }
  return roots
}

function parseStartTag(body: string): { tag: string; props: IrProps } {
  const match = /^([a-zA-Z][\w:-]*)([\s\S]*)$/.exec(body)
  const tag = match?.[1]?.toLowerCase()
  if (!tag) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Template HTML is invalid"
    )
  }
  const props: IrProps = {}
  const rest = match?.[2] ?? ""
  const attr = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g
  let found: RegExpExecArray | null
  while ((found = attr.exec(rest)) !== null) {
    const key = found[1]?.toLowerCase()
    if (!key) {
      continue
    }
    if (found[2] === undefined && found[3] === undefined) {
      throw new TemplateRenderError(
        "unsupported_source",
        `HTML attribute is not allowed: ${key}`
      )
    }
    const value = decodeHtml(found[2] ?? found[3] ?? "")
    if (!(HTML_ATTRS[tag] ?? []).includes(key)) {
      throw new TemplateRenderError(
        "unsupported_source",
        `HTML attribute is not allowed: ${key}`
      )
    }
    props[key] = value
  }
  return { tag, props }
}

function htmlLeaf(tag: string, props: IrProps): IrNode {
  if (tag === "br") {
    return { k: "tx", v: "\n" }
  }
  if (tag === "img") {
    const src = stringProp(props, "src")
    if (!src) {
      throw new TemplateRenderError("unsupported_source", "Img requires src")
    }
    assertStaticLink(src, "src")
    const imgProps: IrProps = { src }
    const alt = stringProp(props, "alt")
    const width = stringProp(props, "width")
    const height = stringProp(props, "height")
    if (alt !== undefined) imgProps.alt = alt
    if (width !== undefined) imgProps.width = width
    if (height !== undefined) imgProps.height = height
    return { k: "el", c: "Img", p: imgProps, ch: [] }
  }
  return htmlElement({ tag, props, children: [] })
}

function htmlElement(frame: HtmlFrame): IrNode {
  const children = inlineChildren(frame)
  if (frame.tag === "a") {
    const href = stringProp(frame.props, "href")
    if (href) {
      assertStaticLink(href, "href")
    }
    return {
      k: "el",
      c: "Link",
      p: href ? { href } : {},
      ch: children,
    }
  }
  if (/^h[1-4]$/.test(frame.tag)) {
    return {
      k: "el",
      c: "Heading",
      p: { as: frame.tag },
      ch: children,
    }
  }
  return { k: "el", c: "Text", p: {}, ch: children }
}

function inlineChildren(frame: HtmlFrame): IrNode[] {
  if (frame.tag !== "strong" && frame.tag !== "em" && frame.tag !== "span") {
    return frame.children
  }
  return frame.children
}

function pushElement(stack: HtmlFrame[], roots: IrNode[], node: IrNode): void {
  const parent = stack[stack.length - 1]
  if (parent) {
    parent.children.push(node)
    return
  }
  roots.push(node)
}

function literalProp(key: string, raw: string): string {
  const value = markedToTags(raw)
  if (key === "as" && !/^h[1-4]$/.test(value)) {
    throw new TemplateRenderError(
      "unsupported_source",
      "Heading as must be h1, h2, h3, or h4"
    )
  }
  if (key === "href" || key === "src") {
    assertStaticLink(value, key)
  }
  return value
}

function assertStaticLink(value: string, kind: "href" | "src"): void {
  if (/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/.test(value)) {
    return
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TemplateRenderError(
      "unsupported_source",
      `Template ${kind} is not an allowed URL`
    )
  }
  const allowed =
    url.protocol === "https:" ||
    url.protocol === "http:" ||
    (kind === "href" && url.protocol === "mailto:")
  if (!allowed) {
    throw new TemplateRenderError(
      "unsupported_source",
      `Template ${kind} is not an allowed URL`
    )
  }
}

function stringProp(props: IrProps, key: string): string | undefined {
  const value = props[key]
  return typeof value === "string" ? value : undefined
}

function textToNodes(value: string): IrNode[] {
  return nodesFromPattern(value, /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)
}

function nodesFromMarked(value: string): IrNode[] {
  return nodesFromPattern(
    value,
    new RegExp(`${MERGE_MARK}([A-Za-z_][A-Za-z0-9_]*)${MERGE_MARK}`, "g")
  )
}

function nodesFromPattern(value: string, pattern: RegExp): IrNode[] {
  const nodes: IrNode[] = []
  let last = 0
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > last) {
      nodes.push({ k: "tx", v: value.slice(last, match.index) })
    }
    const name = match[1]
    if (name) {
      nodes.push({ k: "mg", n: name })
    }
    last = match.index + match[0].length
  }
  if (last < value.length) {
    nodes.push({ k: "tx", v: value.slice(last) })
  }
  return nodes
}

function embedMergeTags(source: string): string {
  let out = ""
  let index = 0
  let quote: "'" | '"' | "`" | null = null
  while (index < source.length) {
    const current = source[index] ?? ""
    const next = source[index + 1] ?? ""
    if (quote === null && current === "/" && next === "/") {
      const end = source.indexOf("\n", index)
      const stop = end === -1 ? source.length : end
      out += source.slice(index, stop)
      index = stop
      continue
    }
    if (quote === null && current === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(index, stop)
      index = stop
      continue
    }
    if (quote !== null) {
      if (current === "\\") {
        out += source.slice(index, index + 2)
        index += 2
        continue
      }
      if (current === quote) {
        quote = null
        out += current
        index += 1
        continue
      }
      const marked = takeMergeTag(source, index)
      if (marked) {
        out += `${MERGE_MARK}${marked.name}${MERGE_MARK}`
        index += marked.length
        continue
      }
      out += current
      index += 1
      continue
    }
    if (current === '"' || current === "'" || current === "`") {
      quote = current
      out += current
      index += 1
      continue
    }
    const marked = takeMergeTag(source, index)
    if (marked) {
      out += `{"${MERGE_MARK}${marked.name}${MERGE_MARK}"}`
      index += marked.length
      continue
    }
    out += current
    index += 1
  }
  return out
}

function markedToTags(value: string): string {
  return value.replace(
    new RegExp(`${MERGE_MARK}([A-Za-z_][A-Za-z0-9_]*)${MERGE_MARK}`, "g"),
    "{{$1}}"
  )
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ")
}

function limitTree(node: IrNode): IrNode {
  if (countNodes(node) > MAX_NODES || treeDepth(node) > MAX_DEPTH) {
    throw new TemplateRenderError("unsupported_source", "Template is too large")
  }
  return node
}

function countNodes(node: IrNode): number {
  if (node.k !== "el") {
    return 1
  }
  return node.ch.reduce((total, child) => total + countNodes(child), 1)
}

function treeDepth(node: IrNode, current = 1): number {
  if (node.k !== "el" || node.ch.length === 0) {
    return current
  }
  let deepest = current
  for (const child of node.ch) {
    deepest = Math.max(deepest, treeDepth(child, current + 1))
  }
  return deepest
}

function takeMergeTag(
  source: string,
  index: number
): { name: string; length: number } | undefined {
  const match = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/.exec(
    source.slice(index)
  )
  const name = match?.[1]
  if (!name || !match) {
    return undefined
  }
  return { name, length: match[0].length }
}

function moduleLabel(value: string | undefined): string {
  if (!value) {
    return "unknown"
  }
  const trimmed = value.trim()
  if (
    trimmed === "" ||
    trimmed.length > 80 ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.startsWith("/") ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    return "unknown"
  }
  return trimmed
}

function child(node: Ast | undefined, key: string): Ast | undefined {
  if (!node) {
    return undefined
  }
  const value = node[key]
  return isAst(value) ? value : undefined
}

function array(node: Ast | undefined, key: string): Ast[] | undefined {
  if (!node) {
    return undefined
  }
  const value = node[key]
  if (!Array.isArray(value) || !value.every(isAst)) {
    return undefined
  }
  return value
}

function stringValue(node: Ast | undefined, key: string): string | undefined {
  if (!node) {
    return undefined
  }
  const value = node[key]
  return typeof value === "string" ? value : undefined
}

function identifierName(node: Ast | undefined): string | undefined {
  if (!node) {
    return undefined
  }
  if (node.type === "Identifier") {
    return stringValue(node, "name")
  }
  if (node.type === "StringLiteral") {
    return stringValue(node, "value")
  }
  return undefined
}

function isAst(value: unknown): value is Ast {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  )
}
