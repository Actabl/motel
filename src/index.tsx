import { RegistryProvider } from "@effect/atom-react"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App.js"

const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	screenMode: "alternate-screen",
	onDestroy: () => {
		process.exit(0)
	},
})

createRoot(renderer).render(
	<RegistryProvider>
		<App />
	</RegistryProvider>,
)
