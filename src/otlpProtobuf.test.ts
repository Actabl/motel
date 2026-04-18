import { describe, expect, it } from "bun:test"
import { decodeLogExportRequestFromProtobuf, decodeTraceExportRequestFromProtobuf } from "./otlpProtobuf.js"

import otlpRootModule = require("@opentelemetry/otlp-transformer/build/src/generated/root")

const otlpRoot = otlpRootModule as any
const traceRequestType = otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest
const logsRequestType = otlpRoot.opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"))

describe("otlp protobuf decoding", () => {
	it("decodes a trace export request into Motel's normalized OTLP shape", () => {
		// Arrange
		const bytes = traceRequestType
			.encode({
			resourceSpans: [
				{
					resource: {
						attributes: [
							{ key: "service.name", value: { stringValue: "protobuf-trace-service" } },
						],
						droppedAttributesCount: 0,
					},
					scopeSpans: [
						{
							scope: { name: "protobuf-scope" },
							spans: [
								{
									traceId: hexToBytes("00112233445566778899aabbccddeeff"),
									spanId: hexToBytes("1122334455667788"),
									parentSpanId: hexToBytes("8899aabbccddeeff"),
									name: "protobuf.trace",
									kind: 2,
									startTimeUnixNano: "1713450000000000000",
									endTimeUnixNano: "1713450000001000000",
									attributes: [
										{ key: "string.attr", value: { stringValue: "hello" } },
										{ key: "bool.attr", value: { boolValue: true } },
										{ key: "int.attr", value: { intValue: 42 } },
										{
											key: "list.attr",
											value: {
												arrayValue: {
													values: [{ stringValue: "one" }, { stringValue: "two" }],
												},
											},
										},
										{
											key: "object.attr",
											value: {
												kvlistValue: {
													values: [{ key: "nested", value: { stringValue: "value" } }],
												},
											},
										},
									],
									status: { code: 2, message: "boom" },
									events: [
										{
											timeUnixNano: "1713450000000500000",
											name: "db.query",
											attributes: [{ key: "sql.table", value: { stringValue: "users" } }],
											droppedAttributesCount: 0,
										},
									],
									links: [],
									droppedAttributesCount: 0,
									droppedEventsCount: 0,
									droppedLinksCount: 0,
								},
							],
							schemaUrl: undefined,
						},
					],
					schemaUrl: undefined,
				},
			],
			})
			.finish() as Uint8Array

		// Act
		const decoded = decodeTraceExportRequestFromProtobuf(bytes)

		// Assert
		expect(decoded.resourceSpans).toHaveLength(1)
		expect(decoded.resourceSpans?.[0]?.resource?.attributes?.[0]).toEqual({
			key: "service.name",
			value: { stringValue: "protobuf-trace-service" },
		})

		const span = decoded.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]
		expect(span?.traceId).toBe("00112233445566778899aabbccddeeff")
		expect(span?.spanId).toBe("1122334455667788")
		expect(span?.parentSpanId).toBe("8899aabbccddeeff")
		expect(span?.name).toBe("protobuf.trace")
		expect(span?.kind).toBe(2)
		expect(span?.startTimeUnixNano).toBe("1713450000000000000")
		expect(span?.endTimeUnixNano).toBe("1713450000001000000")
		expect(span?.status).toEqual({ code: 2, message: "boom" })
		expect(span?.attributes).toEqual([
			{ key: "string.attr", value: { stringValue: "hello" } },
			{ key: "bool.attr", value: { boolValue: true } },
			{ key: "int.attr", value: { intValue: "42" } },
			{
				key: "list.attr",
				value: { arrayValue: { values: [{ stringValue: "one" }, { stringValue: "two" }] } },
			},
			{
				key: "object.attr",
				value: { kvlistValue: { values: [{ key: "nested", value: { stringValue: "value" } }] } },
			},
		])
		expect(span?.events).toEqual([
			{
				timeUnixNano: "1713450000000500000",
				name: "db.query",
				attributes: [{ key: "sql.table", value: { stringValue: "users" } }],
			},
		])
	})

	it("decodes a log export request into Motel's normalized OTLP shape", () => {
		// Arrange
		const bytes = logsRequestType
			.encode({
			resourceLogs: [
				{
					resource: {
						attributes: [{ key: "service.name", value: { stringValue: "protobuf-log-service" } }],
						droppedAttributesCount: 0,
					},
					scopeLogs: [
						{
							scope: { name: "protobuf-log-scope" },
							logRecords: [
								{
									timeUnixNano: "1713450000002000000",
									observedTimeUnixNano: "1713450000003000000",
									severityText: "ERROR",
									severityNumber: 17,
									body: { stringValue: "protobuf log body" },
									attributes: [
										{ key: "retryable", value: { boolValue: false } },
									],
									traceId: hexToBytes("fedcba98765432100123456789abcdef"),
									spanId: hexToBytes("0123456789abcdef"),
									droppedAttributesCount: 0,
								},
							],
							schemaUrl: undefined,
						},
					],
					schemaUrl: undefined,
				},
			],
			})
			.finish() as Uint8Array

		// Act
		const decoded = decodeLogExportRequestFromProtobuf(bytes)

		// Assert
		expect(decoded.resourceLogs).toHaveLength(1)
		const record = decoded.resourceLogs?.[0]?.scopeLogs?.[0]?.logRecords?.[0]
		expect(record).toEqual({
			timeUnixNano: "1713450000002000000",
			observedTimeUnixNano: "1713450000003000000",
			severityText: "ERROR",
			body: { stringValue: "protobuf log body" },
			attributes: [{ key: "retryable", value: { boolValue: false } }],
			traceId: "fedcba98765432100123456789abcdef",
			spanId: "0123456789abcdef",
		})
	})
})
