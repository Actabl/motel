import { config } from "./config.js"
import { startLocalServer } from "./localServer.js"

await startLocalServer()

console.log(`leto local telemetry server listening on ${config.otel.queryUrl}`)

await new Promise(() => {
	// keep process alive
})
