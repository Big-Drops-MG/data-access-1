import { PACKAGE_NAME as db } from "@workspace/db"
import { PACKAGE_NAME as emails } from "@workspace/emails"
import { PACKAGE_NAME as shared } from "@workspace/shared"

export function bootstrap(): void {
  process.stdout.write(
    `worker ready (deps: ${shared}, ${db}, ${emails})${String.fromCharCode(10)}`
  )
}

bootstrap()
