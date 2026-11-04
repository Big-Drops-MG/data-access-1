import { parentPort, workerData } from "node:worker_threads"
import type { ReactElement, ReactNode } from "react"

type IrProps = Record<string, string | number | boolean>

type IrNode =
  | { k: "el"; c: string; p: IrProps; ch: IrNode[] }
  | { k: "tx"; v: string }
  | { k: "mg"; n: string }

type WorkerJob =
  | { kind: "render"; tree: IrNode }
  | { kind: "delay"; ms: number }
  | { kind: "crash" }
  | { kind: "allocate"; megabytes: number }
  | { kind: "env" }

type EmailComponent = (props: Record<string, unknown>) => ReactElement | null

const PROP_ALLOW: Record<string, readonly string[]> = {
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

type LoadedRenderer = {
  render: (
    element: ReactNode,
    options: { pretty: false; plainText?: boolean }
  ) => Promise<string>
  createElement: (
    component: EmailComponent,
    props: Record<string, string | number | boolean>,
    ...children: ReactNode[]
  ) => ReactElement
  components: Record<string, EmailComponent>
}

let renderer: LoadedRenderer | undefined

async function loadRenderer(): Promise<LoadedRenderer> {
  if (renderer) {
    return renderer
  }
  const [react, email, reactEmail] = await Promise.all([
    import("react"),
    import("@react-email/components"),
    import("@react-email/render"),
  ])
  renderer = {
    render: reactEmail.render as LoadedRenderer["render"],
    createElement: react.createElement as LoadedRenderer["createElement"],
    components: {
      Html: email.Html as unknown as EmailComponent,
      Head: email.Head as unknown as EmailComponent,
      Body: email.Body as unknown as EmailComponent,
      Container: email.Container as unknown as EmailComponent,
      Section: email.Section as unknown as EmailComponent,
      Row: email.Row as unknown as EmailComponent,
      Column: email.Column as unknown as EmailComponent,
      Text: email.Text as unknown as EmailComponent,
      Heading: email.Heading as unknown as EmailComponent,
      Button: email.Button as unknown as EmailComponent,
      Link: email.Link as unknown as EmailComponent,
      Img: email.Img as unknown as EmailComponent,
      Preview: email.Preview as unknown as EmailComponent,
    },
  }
  return renderer
}

const port = parentPort
if (!port) {
  throw new Error("render worker requires parentPort")
}

const launch = readLaunch(workerData)
if (launch.failInit) {
  throw new Error("Render worker failed")
}
if (launch.holdReadyMs > 0) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    launch.holdReadyMs
  )
}
port.postMessage({ ready: true })
const loading = loadRenderer()
try {
  for (;;) {
    const job = await new Promise<WorkerJob>((resolve) => {
      port.once("message", (data: WorkerJob) => {
        resolve(data)
      })
    })
    port.postMessage(await run(job))
  }
} catch {
  process.exit(1)
}

async function run(
  job: WorkerJob
): Promise<
  | { ok: true; html: string; text: string }
  | { ok: false; code: "render_failed"; message: string }
> {
  if (job.kind === "delay") {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, job.ms)
    return { ok: true, html: "", text: "" }
  }
  if (job.kind === "crash") {
    throw new Error("render worker crashed")
  }
  if (job.kind === "allocate") {
    const chunks: { n: number; c: number }[] = []
    const count = Math.max(job.megabytes, 1) * 100_000
    for (let index = 0; index < count; index += 1) {
      chunks.push({ n: index, c: index })
    }
    return { ok: true, html: String(chunks.length), text: "" }
  }
  if (job.kind === "env") {
    return { ok: true, html: JSON.stringify(process.env), text: "" }
  }
  try {
    const loaded = await loading
    const element = toElement(job.tree, loaded)
    const html = await loaded.render(element, { pretty: false })
    const text = await loaded.render(element, {
      plainText: true,
      pretty: false,
    })
    return { ok: true, html, text }
  } catch {
    return { ok: false, code: "render_failed", message: "Render failed" }
  }
}

function toElement(node: IrNode, loaded: LoadedRenderer): ReactNode {
  if (node.k === "tx") {
    return node.v
  }
  if (node.k !== "el") {
    throw new Error("unsubstituted merge tag")
  }
  const component = loaded.components[node.c]
  const allowed = PROP_ALLOW[node.c]
  if (!component || !allowed) {
    throw new Error("component is not allowed")
  }
  const children = node.ch.map((child) => toElement(child, loaded))
  return loaded.createElement(
    component,
    safeProps(node.p, allowed),
    ...children
  )
}

function safeProps(
  props: IrProps,
  allowed: readonly string[]
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {}
  for (const key of allowed) {
    const value = props[key]
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      continue
    }
    if (
      key === "as" &&
      (typeof value !== "string" || !/^h[1-4]$/.test(value))
    ) {
      throw new Error("component is not allowed")
    }
    if (
      (key === "href" || key === "src") &&
      (typeof value !== "string" || !isSafeUrl(value, key))
    ) {
      throw new Error("component is not allowed")
    }
    safe[key] = value
  }
  return safe
}

function isSafeUrl(value: string, kind: "href" | "src"): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" ||
      url.protocol === "http:" ||
      (kind === "href" && url.protocol === "mailto:")
    )
  } catch {
    return false
  }
}

function readLaunch(data: unknown): { failInit: boolean; holdReadyMs: number } {
  if (typeof data !== "object" || data === null) {
    return { failInit: false, holdReadyMs: 0 }
  }
  const hold =
    "holdReadyMs" in data &&
    typeof data.holdReadyMs === "number" &&
    data.holdReadyMs > 0
      ? data.holdReadyMs
      : 0
  return {
    failInit: "failInit" in data && data.failInit === true,
    holdReadyMs: hold,
  }
}
