import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Worker, type ResourceLimits } from "node:worker_threads"

import type { IrNode } from "./template-plan.js"
import { RENDER_TIMEOUT_MS } from "./template-plan.js"
import { TemplateRenderError } from "./template-render-error.js"

export const WORKER_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 32,
  maxYoungGenerationSizeMb: 8,
  codeRangeSizeMb: 16,
  stackSizeMb: 4,
}

export type WorkerJob =
  | { kind: "render"; tree: IrNode }
  | { kind: "delay"; ms: number }
  | { kind: "crash" }
  | { kind: "allocate"; megabytes: number }
  | { kind: "env" }

export type WorkerSuccess = {
  html: string
  text: string
}

type WorkerResponse =
  | { ok: true; html: string; text: string }
  | { ok: false; code: "render_failed"; message: string }

const NS_PER_MS = 1_000_000n

export type RenderDeadline = {
  readonly timeoutMs: number
  remainingMs: () => number
  expired: () => boolean
}

export type WorkerLaunch = {
  holdReadyMs?: number
  failInit?: boolean
}

export function startRenderDeadline(
  timeoutMs = RENDER_TIMEOUT_MS
): RenderDeadline {
  const start = process.hrtime.bigint()
  const budget = BigInt(timeoutMs) * NS_PER_MS
  return {
    timeoutMs,
    expired() {
      return process.hrtime.bigint() - start >= budget
    },
    remainingMs() {
      const left = budget - (process.hrtime.bigint() - start)
      if (left <= 0n) {
        return 0
      }
      return Number(left / NS_PER_MS)
    },
  }
}

const idleWorkers: Worker[] = []
const busyWorkers = new WeakSet<Worker>()
let pendingReady: Promise<Worker> | null = null

export async function runWorkerJob(
  job: WorkerJob,
  deadline: RenderDeadline = startRenderDeadline(),
  launch: WorkerLaunch = {}
): Promise<WorkerSuccess> {
  if (deadline.expired()) {
    throw timeoutError(deadline.timeoutMs)
  }
  if (!canReuse(job, launch)) {
    const worker = createWorker(launch)
    try {
      return await executeJob(worker, job, deadline, false)
    } finally {
      await stopWorker(worker)
    }
  }
  const worker = await takeRenderWorker(deadline)
  try {
    const result = await executeJob(worker, job, deadline, true)
    releaseWorker(worker)
    return result
  } catch (error) {
    if (
      error instanceof TemplateRenderError &&
      error.code === "render_failed"
    ) {
      releaseWorker(worker)
    } else {
      busyWorkers.delete(worker)
      await stopWorker(worker)
    }
    throw error
  }
}

function canReuse(job: WorkerJob, launch: WorkerLaunch): boolean {
  return (
    job.kind === "render" &&
    launch.failInit !== true &&
    !(typeof launch.holdReadyMs === "number" && launch.holdReadyMs > 0)
  )
}

function preloadRenderWorker(): void {
  if (pendingReady || idleWorkers.length > 0) {
    return
  }
  const worker = createWorker({})
  const ready = waitUntilReady(worker, startRenderDeadline()).then(() => worker)
  pendingReady = ready
  void ready.then(
    (started) => {
      if (pendingReady === ready) {
        pendingReady = null
      }
      if (!busyWorkers.has(started)) {
        parkWorker(started)
      }
    },
    async () => {
      if (pendingReady === ready) {
        pendingReady = null
      }
      await stopWorker(worker)
    }
  )
}

async function takeRenderWorker(deadline: RenderDeadline): Promise<Worker> {
  const idle = idleWorkers.pop()
  if (idle) {
    busyWorkers.add(idle)
    return idle
  }
  if (!pendingReady) {
    preloadRenderWorker()
  }
  const ready = pendingReady
  if (!ready) {
    throw new TemplateRenderError("worker_crashed", "Render worker failed")
  }
  const worker = await raceDeadline(ready, deadline)
  busyWorkers.add(worker)
  if (pendingReady === ready) {
    pendingReady = null
  }
  const index = idleWorkers.indexOf(worker)
  if (index >= 0) {
    idleWorkers.splice(index, 1)
  }
  return worker
}

function releaseWorker(worker: Worker): void {
  busyWorkers.delete(worker)
  parkWorker(worker)
}

function parkWorker(worker: Worker): void {
  if (idleWorkers.includes(worker) || busyWorkers.has(worker)) {
    return
  }
  idleWorkers.push(worker)
  if (idleWorkers.length < 2) {
    preloadRenderWorker()
  }
}

function raceDeadline<T>(
  work: Promise<T>,
  deadline: RenderDeadline
): Promise<T> {
  if (deadline.expired()) {
    return Promise.reject(timeoutError(deadline.timeoutMs))
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(timeoutError(deadline.timeoutMs)),
      deadline.remainingMs()
    )
  })
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer)
  })
}

function executeJob(
  worker: Worker,
  job: WorkerJob,
  deadline: RenderDeadline,
  ready: boolean
): Promise<WorkerSuccess> {
  return new Promise((resolve, reject) => {
    let settled = false
    let phase: "start" | "run" = ready ? "run" : "start"
    const timer = setTimeout(() => {
      finish(timeoutError(deadline.timeoutMs))
    }, deadline.remainingMs())
    const onMessage = (message: WorkerResponse | { ready: true }) => {
      if (settled) {
        return
      }
      if (phase === "start") {
        if (!isReady(message)) {
          finish(
            new TemplateRenderError("worker_crashed", "Render worker failed")
          )
          return
        }
        phase = "run"
        if (deadline.expired()) {
          finish(timeoutError(deadline.timeoutMs))
          return
        }
        worker.postMessage(job)
        return
      }
      if (deadline.expired()) {
        finish(timeoutError(deadline.timeoutMs))
        return
      }
      if (!isWorkerResponse(message)) {
        finish(
          new TemplateRenderError("worker_crashed", "Render worker failed")
        )
        return
      }
      if (!message.ok) {
        finish(new TemplateRenderError("render_failed", "Render failed"))
        return
      }
      finish(undefined, { html: message.html, text: message.text })
    }
    const onError = () => {
      finish(new TemplateRenderError("worker_crashed", "Render worker failed"))
    }
    const onExit = () => {
      if (!settled) {
        finish(
          new TemplateRenderError("worker_crashed", "Render worker failed")
        )
      }
    }
    worker.on("message", onMessage)
    worker.on("error", onError)
    worker.on("exit", onExit)
    if (ready) {
      if (deadline.expired()) {
        finish(timeoutError(deadline.timeoutMs))
      } else {
        worker.postMessage(job)
      }
    }

    function finish(error?: TemplateRenderError, value?: WorkerSuccess) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      worker.off("message", onMessage)
      worker.off("error", onError)
      worker.off("exit", onExit)
      if (error) {
        reject(error)
        return
      }
      resolve(value ?? { html: "", text: "" })
    }
  })
}

function waitUntilReady(
  worker: Worker,
  deadline: RenderDeadline
): Promise<void> {
  if (deadline.expired()) {
    return Promise.reject(timeoutError(deadline.timeoutMs))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      finish(timeoutError(deadline.timeoutMs))
    }, deadline.remainingMs())
    const onMessage = (message: unknown) => {
      if (isReady(message)) {
        finish()
        return
      }
      finish(new TemplateRenderError("worker_crashed", "Render worker failed"))
    }
    const onFailure = () => {
      finish(new TemplateRenderError("worker_crashed", "Render worker failed"))
    }
    worker.on("message", onMessage)
    worker.on("error", onFailure)
    worker.on("exit", onFailure)

    function finish(error?: TemplateRenderError) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      worker.off("message", onMessage)
      worker.off("error", onFailure)
      worker.off("exit", onFailure)
      if (error) {
        reject(error)
        return
      }
      resolve()
    }
  })
}

function createWorker(launch: WorkerLaunch): Worker {
  const worker = new Worker(renderWorkerUrl(), {
    resourceLimits: WORKER_RESOURCE_LIMITS,
    env: workerEnvironment(),
    execArgv: [],
    workerData: launchData(launch),
  })
  const detach = () => {
    const index = idleWorkers.indexOf(worker)
    if (index >= 0) {
      idleWorkers.splice(index, 1)
    }
  }
  worker.on("error", detach)
  worker.on("exit", detach)
  return worker
}

preloadRenderWorker()

function timeoutError(timeoutMs: number): TemplateRenderError {
  return new TemplateRenderError(
    "timeout",
    `Rendering exceeded ${String(timeoutMs)}ms`
  )
}

function launchData(launch: WorkerLaunch): WorkerLaunch | undefined {
  if (launch.failInit === true) {
    return { failInit: true }
  }
  if (typeof launch.holdReadyMs === "number" && launch.holdReadyMs > 0) {
    return { holdReadyMs: launch.holdReadyMs }
  }
  return undefined
}

async function stopWorker(worker: Worker): Promise<void> {
  await worker.terminate().catch(() => undefined)
}

function renderWorkerUrl(): URL {
  const compiled = new URL("./render-worker.js", import.meta.url)
  if (existsSync(fileURLToPath(compiled))) {
    return compiled
  }
  return new URL("./render-worker.ts", import.meta.url)
}

function workerEnvironment(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "PATHEXT"]) {
    const value = process.env[key]
    if (value) {
      env[key] = value
    }
  }
  return env
}

function isReady(value: unknown): value is { ready: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    "ready" in value &&
    value.ready === true
  )
}

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false
  }
  if (value.ok === true) {
    return (
      "html" in value &&
      "text" in value &&
      typeof value.html === "string" &&
      typeof value.text === "string"
    )
  }
  return value.ok === false
}
