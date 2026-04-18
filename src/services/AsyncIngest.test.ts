import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer, ManagedRuntime } from "effect"

describe("AsyncIngest", () => {
	let tempDir: string
	let dbPath: string
	let runtime: ManagedRuntime.ManagedRuntime<any, never>
	let AsyncIngest: Awaited<typeof import("./AsyncIngest.ts")>["AsyncIngest"]
	let AsyncIngestLive: Awaited<typeof import("./AsyncIngest.ts")>["AsyncIngestLive"]

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "motel-async-ingest-test-"))
		dbPath = join(tempDir, "telemetry.sqlite")
		process.env.MOTEL_OTEL_DB_PATH = dbPath
		process.env.MOTEL_OTEL_RETENTION_HOURS = "24"
		const suffix = `?test=${Date.now()}-${Math.random()}`
		;({ AsyncIngest, AsyncIngestLive } = await import(`./AsyncIngest.ts${suffix}`))
		runtime = ManagedRuntime.make(AsyncIngestLive)
	})

	afterEach(async () => {
		await runtime.dispose()
		rmSync(tempDir, { recursive: true, force: true })
	})

	it("ingests traces through the worker client", async () => {
		const nowNanos = BigInt(Date.now()) * 1_000_000n

		const result = await runtime.runPromise(
			Effect.flatMap(AsyncIngest.asEffect(), (ingest) =>
				ingest.ingestTraces({
					payload: {
						resourceSpans: [
							{
								resource: {
									attributes: [
										{ key: "service.name", value: { stringValue: "async-ingest-test" } },
									],
								},
								scopeSpans: [
									{
										scope: { name: "test-scope" },
										spans: [
											{
												traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
												spanId: "bbbbbbbbbbbbbbbb",
												name: "async.ingest",
												kind: 2,
												startTimeUnixNano: String(nowNanos),
												endTimeUnixNano: String(nowNanos + 1_000_000n),
											},
										],
									},
								],
							},
						],
					},
				}),
			),
		)

		expect(result.insertedSpans).toBe(1)
	})
})
