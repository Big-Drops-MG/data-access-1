import { provisionE2eDatabase } from "./provision-database.mjs"

export default async function globalSetup() {
  await provisionE2eDatabase()
}
