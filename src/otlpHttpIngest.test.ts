import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { encodeRpcStatusToProtobuf, encodeTraceExportSuccessResponseToProtobuf } from "./otlpProtobuf.js"

import otlpRootModule = require("@opentelemetry/otlp-transformer/build/src/generated/root")

const otlpRoot = otlpRootModule as any
const traceRequestType = otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest
const logRequestType = otlpRoot.opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest
const traceResponseType = otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"))
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer

describe("OTLP HTTP ingest", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "motel-http-protobuf-"))
	const port = 27697
	const baseUrl = `http://127.0.0.1:${port}`
	const dbPath = join(tempDir, "telemetry.sqlite")
	let serverProcess: Bun.Subprocess | undefined

	beforeAll(async () => {
		serverProcess = Bun.spawn(["bun", "run", "src/server.ts"], {
			cwd: join(import.meta.dir, ".."),
			env: {
				...process.env,
				MOTEL_OTEL_PORT: String(port),
				MOTEL_OTEL_BASE_URL: baseUrl,
				MOTEL_OTEL_QUERY_URL: baseUrl,
				MOTEL_OTEL_DB_PATH: dbPath,
				MOTEL_OTEL_ENABLED: "false",
			},
			stdout: "ignore",
			stderr: "ignore",
		})

		for (let attempt = 0; attempt < 50; attempt++) {
			try {
				const response = await fetch(`${baseUrl}/api/health`)
				if (response.ok) return
			} catch {}
			await Bun.sleep(100)
		}

		throw new Error("Timed out waiting for Motel test server")
	}, { timeout: 20000 })

	afterAll(async () => {
		serverProcess?.kill("SIGTERM")
		await serverProcess?.exited
		rmSync(tempDir, { recursive: true, force: true })
	}, { timeout: 20000 })

	it("accepts JSON traces when Content-Type is missing", async () => {
		const body = JSON.stringify({
			resourceSpans: [
				{
					resource: { attributes: [{ key: "service.name", value: { stringValue: "json-missing-header" } }] },
					scopeSpans: [{
						scope: { name: "tests" },
						spans: [{
							traceId: "00112233445566778899aabbccddeeff",
							spanId: "1122334455667788",
							name: "json.trace",
							kind: 2,
							startTimeUnixNano: "1713450000000000000",
							endTimeUnixNano: "1713450000001000000",
						}],
					}],
				},
			],
		})

		const rawResponse = await new Promise<string>((resolve, reject) => {
			const socket = new Socket()
			let response = ""
			let resolved = false
			socket.setEncoding("utf8")
			socket.setTimeout(3000, () => {
				if (!resolved) socket.destroy(new Error("Timed out waiting for raw OTLP HTTP response"))
			})
			socket.connect(port, "127.0.0.1", () => {
				socket.write([
					"POST /v1/traces HTTP/1.1",
					`Host: 127.0.0.1:${port}`,
					"Connection: close",
					`Content-Length: ${Buffer.byteLength(body)}`,
					"",
					body,
				].join("\r\n"))
			})
			socket.on("data", (chunk) => {
				response += chunk
				if (response.includes("\r\n\r\n")) {
					resolved = true
					resolve(response)
					socket.end()
				}
			})
			socket.on("end", () => {
				if (!resolved) {
					resolved = true
					resolve(response)
				}
			})
			socket.on("error", reject)
		})

		expect(rawResponse).toContain("HTTP/1.1 200 OK")
		expect(rawResponse).toContain("Content-Type: application/json")
		expect(rawResponse.trimEnd()).toEndWith("{}")
	}, { timeout: 10000 })

	it("accepts protobuf traces and returns protobuf OTLP success responses", async () => {
		const payload = traceRequestType.encode({
			resourceSpans: [{
				resource: { attributes: [{ key: "service.name", value: { stringValue: "protobuf-route-test" } }] },
				scopeSpans: [{
					scope: { name: "tests" },
					spans: [{
						traceId: hexToBytes("11112222333344445555666677778888"),
						spanId: hexToBytes("9999aaaabbbbcccc"),
						name: "protobuf.trace",
						kind: 2,
						startTimeUnixNano: "1713450000000000000",
						endTimeUnixNano: "1713450000001000000",
					}],
				}],
			}],
		}).finish() as Uint8Array

		const response = await fetch(`${baseUrl}/v1/traces`, {
			method: "POST",
			headers: { "Content-Type": "application/x-protobuf" },
			body: toArrayBuffer(payload),
		})

		expect(response.status).toBe(200)
		expect(response.headers.get("content-type")?.includes("application/x-protobuf")).toBeTrue()

		const bytes = new Uint8Array(await response.arrayBuffer())
		expect(Array.from(bytes)).toEqual(Array.from(encodeTraceExportSuccessResponseToProtobuf()))
		expect(traceResponseType.decode(bytes)).toEqual(traceResponseType.decode(encodeTraceExportSuccessResponseToProtobuf()))
	})

	it("rejects explicit unsupported media types with 415", async () => {
		const response = await fetch(`${baseUrl}/v1/traces`, {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: "nope",
		})

		expect(response.status).toBe(415)
		expect(await response.json()).toEqual({
			message: "Unsupported content type. Expected application/json, application/x-protobuf, or an empty Content-Type.",
		})
	})

	it("rejects malformed protobuf payloads with 400", async () => {
		const response = await fetch(`${baseUrl}/v1/logs`, {
			method: "POST",
			headers: { "Content-Type": "application/x-protobuf" },
			body: toArrayBuffer(new Uint8Array([1, 2, 3, 4])),
		})

		expect(response.status).toBe(400)
		expect(response.headers.get("content-type")?.includes("application/x-protobuf")).toBeTrue()
		expect(Buffer.from(await response.arrayBuffer()).toString("hex")).toBe(Buffer.from(encodeRpcStatusToProtobuf("Invalid OTLP log export payload.")).toString("hex"))
	})

	it("accepts protobuf logs", async () => {
		const payload = logRequestType.encode({
			resourceLogs: [{
				resource: { attributes: [{ key: "service.name", value: { stringValue: "protobuf-log-route-test" } }] },
				scopeLogs: [{
					scope: { name: "tests" },
					logRecords: [{
						timeUnixNano: "1713450000005000000",
						severityText: "INFO",
						body: { stringValue: "hello" },
						traceId: hexToBytes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
						spanId: hexToBytes("bbbbbbbbbbbbbbbb"),
					}],
				}],
			}],
		}).finish() as Uint8Array

		const response = await fetch(`${baseUrl}/v1/logs`, {
			method: "POST",
			headers: { "Content-Type": "application/x-protobuf" },
			body: toArrayBuffer(payload),
		})

		expect(response.status).toBe(200)
		expect(response.headers.get("content-type")?.includes("application/x-protobuf")).toBeTrue()
	})
})
