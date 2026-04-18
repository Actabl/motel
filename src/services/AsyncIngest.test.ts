import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer, ManagedRuntime } from "effect"
import { decodeLogExportRequestFromProtobuf, decodeTraceExportRequestFromProtobuf } from "../otlpProtobuf.js"

import otlpRootModule = require("@opentelemetry/otlp-transformer/build/src/generated/root")

const otlpRoot = otlpRootModule as any
const traceRequestType = otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest
const logRequestType = otlpRoot.opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"))

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

	it("ingests protobuf-normalized traces and logs through the worker client", async () => {
		const nowNanos = BigInt(Date.now()) * 1_000_000n

		const tracePayload = decodeTraceExportRequestFromProtobuf(traceRequestType.encode({
			resourceSpans: [{
				resource: {
					attributes: [{ key: "service.name", value: { stringValue: "async-protobuf-test" } }],
				},
				scopeSpans: [{
					scope: { name: "test-scope" },
					spans: [{
						traceId: hexToBytes("cccccccccccccccccccccccccccccccc"),
						spanId: hexToBytes("dddddddddddddddd"),
						name: "async.protobuf.trace",
						kind: 2,
						startTimeUnixNano: String(nowNanos),
						endTimeUnixNano: String(nowNanos + 1_000_000n),
					}],
				}],
			}],
		}).finish() as Uint8Array)

		const logPayload = decodeLogExportRequestFromProtobuf(logRequestType.encode({
			resourceLogs: [{
				resource: {
					attributes: [{ key: "service.name", value: { stringValue: "async-protobuf-test" } }],
				},
				scopeLogs: [{
					scope: { name: "test-scope" },
					logRecords: [{
						timeUnixNano: String(nowNanos + 500_000n),
						severityText: "INFO",
						body: { stringValue: "worker log" },
						traceId: hexToBytes("cccccccccccccccccccccccccccccccc"),
						spanId: hexToBytes("dddddddddddddddd"),
					}],
				}],
			}],
		}).finish() as Uint8Array)

		const result = await runtime.runPromise(
			Effect.flatMap(AsyncIngest.asEffect(), (ingest) =>
				Effect.flatMap(
					ingest.ingestTraces({ payload: tracePayload }),
					() => ingest.ingestLogs({ payload: logPayload }),
				),
			),
		)

		expect(result.insertedLogs).toBe(1)
	})
})
