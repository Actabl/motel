import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createDaemonManager } from "./daemon.js"
import { MOTEL_SERVICE_ID } from "./registry.js"

const repoRoot = path.resolve(import.meta.dir, "..")

const randomPort = () => 29000 + Math.floor(Math.random() * 2000)

interface Harness {
	readonly runtimeDir: string
	readonly port: number
	readonly databasePath: string
	readonly manager: ReturnType<typeof createDaemonManager>
}

const makeHarness = (): Harness => {
	const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "motel-daemon-test-"))
	const port = randomPort()
	const databasePath = path.join(runtimeDir, "telemetry.sqlite")
	const manager = createDaemonManager({
		repoRoot,
		runtimeDir,
		databasePath,
		port,
	})
	return { runtimeDir, port, databasePath, manager }
}

/**
 * Start a motel-shaped HTTP server on a test port that answers
 * /api/health with an arbitrary delay. Used to simulate a real daemon
 * that's alive + holding the port but currently slow — the exact
 * scenario that makes `bun dev` fail with EADDRINUSE when the
 * supervisor's health probe times out and it tries to spawn a
 * duplicate. Returns a stop() that releases the port.
 */
const startFakeDaemon = (opts: {
	readonly port: number
	readonly databasePath: string
	readonly delayMs: number
}) => {
	const startedAt = new Date().toISOString()
	const server = Bun.serve({
		port: opts.port,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url)
			if (url.pathname !== "/api/health") {
				return new Response("not found", { status: 404 })
			}
			if (opts.delayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, opts.delayMs))
			}
			return Response.json({
				ok: true,
				service: MOTEL_SERVICE_ID,
				databasePath: opts.databasePath,
				pid: process.pid,
				url: `http://127.0.0.1:${opts.port}`,
				workdir: process.cwd(),
				startedAt,
				version: "0.0.0-test",
			})
		},
	})
	return { stop: () => server.stop(true) }
}

const activeHarnesses: Array<ReturnType<typeof makeHarness>> = []

afterEach(async () => {
	for (const harness of activeHarnesses.splice(0)) {
		await Effect.runPromise(harness.manager.stop).catch(() => undefined)
		fs.rmSync(harness.runtimeDir, { recursive: true, force: true })
	}
})

describe("daemon manager", () => {
	test("adopts a slow-to-respond healthy daemon instead of spawning a duplicate", async () => {
		// Reproduces the `bun dev` EADDRINUSE flake. A real daemon is alive
		// and holds the port, but its /api/health response takes longer
		// than the supervisor's 750ms fetch timeout (e.g. the daemon is
		// backfilling FTS or the SQLite writer lock is held). The buggy
		// behaviour: supervisor thinks the port is free, spawns a fresh
		// daemon child, the child tries to bind() → EADDRINUSE → child
		// exits → supervisor throws "exited before becoming healthy".
		//
		// Correct behaviour: supervisor retries the health probe with a
		// longer budget before declaring the port empty, finds the
		// (slow) healthy motel on it, and adopts.
		const harness = makeHarness()
		activeHarnesses.push(harness)
		const fake = startFakeDaemon({
			port: harness.port,
			databasePath: harness.databasePath,
			delayMs: 1_500,
		})
		try {
			const status = await Effect.runPromise(harness.manager.ensure)
			expect(status.running).toBe(true)
			expect(status.managed).toBe(true)
			// PID belongs to the fake test server, not a newly-spawned daemon.
			expect(status.pid).toBe(process.pid)
		} finally {
			fake.stop()
		}
	})

	test("starts once, reuses the same daemon, and stops cleanly", async () => {
		const harness = makeHarness()
		activeHarnesses.push(harness)

		const initial = await Effect.runPromise(harness.manager.getStatus)
		expect(initial.running).toBe(false)

		const started = await Effect.runPromise(harness.manager.ensure)
		expect(started.running).toBe(true)
		expect(started.managed).toBe(true)
		expect(typeof started.pid).toBe("number")
		expect(started.databasePath).toBe(path.join(harness.runtimeDir, "telemetry.sqlite"))

		const reused = await Effect.runPromise(harness.manager.ensure)
		expect(reused.running).toBe(true)
		expect(reused.pid).toBe(started.pid)

		const stopped = await Effect.runPromise(harness.manager.stop)
		expect(stopped.running).toBe(false)

		const finalStatus = await Effect.runPromise(harness.manager.getStatus)
		expect(finalStatus.running).toBe(false)
	})
})
