import { notFound } from "next/navigation"

/** Triggers the app not-found UI so 404 is reachable from the demo. */
export default function PageStatesMissingDemo() {
  notFound()
}
