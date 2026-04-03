import { RegistryProvider } from "@effect/atom-react"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App.js"
import { ensureLocalServer } from "./localServer.js"

await ensureLocalServer()

const renderer = await createCliRenderer({ exitOnCtrlC: false })

createRoot(renderer).render(
	<RegistryProvider>
		<App />
	</RegistryProvider>,
)
