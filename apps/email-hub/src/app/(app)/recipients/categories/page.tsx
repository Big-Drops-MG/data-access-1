import { redirect } from "next/navigation"

/** Categories UI is deferred; keep the route but send users to the list. */
export default function Page() {
  redirect("/recipients")
}
