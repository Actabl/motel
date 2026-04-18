import otlpRootModule = require("@opentelemetry/otlp-transformer/build/src/generated/root")
import type {
	OtlpAnyValue,
	OtlpKeyValue,
	OtlpLogExportRequest,
	OtlpLogRecord,
	OtlpResourceLogs,
	OtlpResourceSpans,
	OtlpScopeLogs,
	OtlpScopeSpans,
	OtlpSpan,
	OtlpSpanEvent,
	OtlpTraceExportRequest,
} from "./otlp.js"

const otlpRoot = otlpRootModule as any
const traceRequestType = otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest
const logsRequestType = otlpRoot.opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest
const traceResponseType = otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse
const logsResponseType = otlpRoot.opentelemetry.proto.collector.logs.v1.ExportLogsServiceResponse

const textEncoder = new TextEncoder()

type ProtoBytes = Uint8Array | Buffer | number[] | string | null | undefined

type ProtoAnyValue = {
	readonly stringValue?: string | null
	readonly boolValue?: boolean | null
	readonly intValue?: bigint | number | { readonly low: number; readonly high: number; toString(): string } | null
	readonly doubleValue?: number | null
	readonly bytesValue?: ProtoBytes
	readonly arrayValue?: { readonly values?: readonly ProtoAnyValue[] | null } | null
	readonly kvlistValue?: { readonly values?: readonly ProtoKeyValue[] | null } | null
}

type ProtoKeyValue = {
	readonly key?: string | null
	readonly value?: ProtoAnyValue | null
}

type ProtoSpanEvent = {
	readonly timeUnixNano?: bigint | number | { toString(): string } | null
	readonly name?: string | null
	readonly attributes?: readonly ProtoKeyValue[] | null
}

type ProtoSpan = {
	readonly traceId?: ProtoBytes
	readonly spanId?: ProtoBytes
	readonly parentSpanId?: ProtoBytes
	readonly name?: string | null
	readonly kind?: number | null
	readonly startTimeUnixNano?: bigint | number | { toString(): string } | null
	readonly endTimeUnixNano?: bigint | number | { toString(): string } | null
	readonly attributes?: readonly ProtoKeyValue[] | null
	readonly status?: { readonly code?: number | null; readonly message?: string | null } | null
	readonly events?: readonly ProtoSpanEvent[] | null
}

type ProtoScopeSpans = {
	readonly scope?: { readonly name?: string | null } | null
	readonly spans?: readonly ProtoSpan[] | null
}

type ProtoResourceSpans = {
	readonly resource?: { readonly attributes?: readonly ProtoKeyValue[] | null } | null
	readonly scopeSpans?: readonly ProtoScopeSpans[] | null
}

type ProtoLogRecord = {
	readonly timeUnixNano?: bigint | number | { toString(): string } | null
	readonly observedTimeUnixNano?: bigint | number | { toString(): string } | null
	readonly severityText?: string | null
	readonly body?: ProtoAnyValue | null
	readonly attributes?: readonly ProtoKeyValue[] | null
	readonly traceId?: ProtoBytes
	readonly spanId?: ProtoBytes
}

type ProtoScopeLogs = {
	readonly scope?: { readonly name?: string | null } | null
	readonly logRecords?: readonly ProtoLogRecord[] | null
}

type ProtoResourceLogs = {
	readonly resource?: { readonly attributes?: readonly ProtoKeyValue[] | null } | null
	readonly scopeLogs?: readonly ProtoScopeLogs[] | null
}

const bytesToHex = (value: ProtoBytes): string | undefined => {
	if (value === undefined || value === null) return undefined
	if (typeof value === "string") return Buffer.from(value, "base64").toString("hex")
	const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value)
	return bytes.length === 0 ? undefined : Buffer.from(bytes).toString("hex")
}

const normalizeLong = (value: bigint | number | { toString(): string } | null | undefined): string | undefined => {
	if (value === undefined || value === null) return undefined
	return typeof value === "number" || typeof value === "bigint" ? String(value) : value.toString()
}

const normalizeAnyValue = (value: ProtoAnyValue | null | undefined): OtlpAnyValue | undefined => {
	if (!value) return undefined
	if (value.stringValue !== undefined && value.stringValue !== null) return { stringValue: value.stringValue }
	if (value.boolValue !== undefined && value.boolValue !== null) return { boolValue: value.boolValue }
	if (value.intValue !== undefined && value.intValue !== null) return { intValue: normalizeLong(value.intValue) }
	if (value.doubleValue !== undefined && value.doubleValue !== null) return { doubleValue: value.doubleValue }
	if (value.bytesValue !== undefined && value.bytesValue !== null) return { bytesValue: Buffer.from(value.bytesValue as never).toString("base64") }
	if (value.arrayValue) {
		return {
			arrayValue: {
				values: (value.arrayValue.values ?? []).map(normalizeAnyValue).filter((entry): entry is OtlpAnyValue => entry !== undefined),
			},
		}
	}
	if (value.kvlistValue) {
		return {
			kvlistValue: {
				values: (value.kvlistValue.values ?? []).map(normalizeKeyValue),
			},
		}
	}
	return undefined
}

const normalizeKeyValue = (value: ProtoKeyValue): OtlpKeyValue => ({
	key: value.key ?? "",
	...(value.value ? { value: normalizeAnyValue(value.value) } : {}),
})

const normalizeSpanEvent = (event: ProtoSpanEvent): OtlpSpanEvent => ({
	...(normalizeLong(event.timeUnixNano) ? { timeUnixNano: normalizeLong(event.timeUnixNano) } : {}),
	...(event.name ? { name: event.name } : {}),
	...(event.attributes?.length ? { attributes: event.attributes.map(normalizeKeyValue) } : {}),
})

const normalizeSpan = (span: ProtoSpan): OtlpSpan => ({
	traceId: bytesToHex(span.traceId) ?? "",
	spanId: bytesToHex(span.spanId) ?? "",
	...(bytesToHex(span.parentSpanId) ? { parentSpanId: bytesToHex(span.parentSpanId) } : {}),
	...(span.name ? { name: span.name } : {}),
	...(span.kind !== undefined && span.kind !== null ? { kind: span.kind } : {}),
	...(normalizeLong(span.startTimeUnixNano) ? { startTimeUnixNano: normalizeLong(span.startTimeUnixNano) } : {}),
	...(normalizeLong(span.endTimeUnixNano) ? { endTimeUnixNano: normalizeLong(span.endTimeUnixNano) } : {}),
	...(span.attributes?.length ? { attributes: span.attributes.map(normalizeKeyValue) } : {}),
	...(span.status ? { status: { ...(span.status.code !== undefined && span.status.code !== null ? { code: span.status.code } : {}), ...(span.status.message ? { message: span.status.message } : {}) } } : {}),
	...(span.events?.length ? { events: span.events.map(normalizeSpanEvent) } : {}),
})

const normalizeScopeSpans = (scopeSpans: ProtoScopeSpans): OtlpScopeSpans => ({
	...(scopeSpans.scope?.name ? { scope: { name: scopeSpans.scope.name } } : {}),
	...(scopeSpans.spans?.length ? { spans: scopeSpans.spans.map(normalizeSpan) } : {}),
})

const normalizeResourceSpans = (resourceSpans: ProtoResourceSpans): OtlpResourceSpans => ({
	...(resourceSpans.resource?.attributes?.length
		? { resource: { attributes: resourceSpans.resource.attributes.map(normalizeKeyValue) } }
		: {}),
	...(resourceSpans.scopeSpans?.length ? { scopeSpans: resourceSpans.scopeSpans.map(normalizeScopeSpans) } : {}),
})

const normalizeLogRecord = (logRecord: ProtoLogRecord): OtlpLogRecord => ({
	...(normalizeLong(logRecord.timeUnixNano) ? { timeUnixNano: normalizeLong(logRecord.timeUnixNano) } : {}),
	...(normalizeLong(logRecord.observedTimeUnixNano) ? { observedTimeUnixNano: normalizeLong(logRecord.observedTimeUnixNano) } : {}),
	...(logRecord.severityText ? { severityText: logRecord.severityText } : {}),
	...(logRecord.body ? { body: normalizeAnyValue(logRecord.body) } : {}),
	...(logRecord.attributes?.length ? { attributes: logRecord.attributes.map(normalizeKeyValue) } : {}),
	...(bytesToHex(logRecord.traceId) ? { traceId: bytesToHex(logRecord.traceId) } : {}),
	...(bytesToHex(logRecord.spanId) ? { spanId: bytesToHex(logRecord.spanId) } : {}),
})

const normalizeScopeLogs = (scopeLogs: ProtoScopeLogs): OtlpScopeLogs => ({
	...(scopeLogs.scope?.name ? { scope: { name: scopeLogs.scope.name } } : {}),
	...(scopeLogs.logRecords?.length ? { logRecords: scopeLogs.logRecords.map(normalizeLogRecord) } : {}),
})

const normalizeResourceLogs = (resourceLogs: ProtoResourceLogs): OtlpResourceLogs => ({
	...(resourceLogs.resource?.attributes?.length
		? { resource: { attributes: resourceLogs.resource.attributes.map(normalizeKeyValue) } }
		: {}),
	...(resourceLogs.scopeLogs?.length ? { scopeLogs: resourceLogs.scopeLogs.map(normalizeScopeLogs) } : {}),
})

export const decodeTraceExportRequestFromProtobuf = (bytes: Uint8Array): OtlpTraceExportRequest => {
	const decoded = traceRequestType.decode(bytes) as { readonly resourceSpans?: readonly ProtoResourceSpans[] | null }
	return {
		...(decoded.resourceSpans?.length ? { resourceSpans: decoded.resourceSpans.map(normalizeResourceSpans) } : {}),
	}
}

export const decodeLogExportRequestFromProtobuf = (bytes: Uint8Array): OtlpLogExportRequest => {
	const decoded = logsRequestType.decode(bytes) as { readonly resourceLogs?: readonly ProtoResourceLogs[] | null }
	return {
		...(decoded.resourceLogs?.length ? { resourceLogs: decoded.resourceLogs.map(normalizeResourceLogs) } : {}),
	}
}

export const encodeTraceExportSuccessResponseToProtobuf = (): Uint8Array =>
	traceResponseType.encode({}).finish() as Uint8Array

export const encodeLogExportSuccessResponseToProtobuf = (): Uint8Array =>
	logsResponseType.encode({}).finish() as Uint8Array

const encodeVarint = (value: number): Uint8Array => {
	const bytes: number[] = []
	let current = value >>> 0
	while (current >= 0x80) {
		bytes.push((current & 0x7f) | 0x80)
		current >>>= 7
	}
	bytes.push(current)
	return Uint8Array.from(bytes)
}

const concatBytes = (...parts: readonly Uint8Array[]): Uint8Array => {
	const total = parts.reduce((sum, part) => sum + part.length, 0)
	const output = new Uint8Array(total)
	let offset = 0
	for (const part of parts) {
		output.set(part, offset)
		offset += part.length
	}
	return output
}

export const encodeRpcStatusToProtobuf = (message: string): Uint8Array => {
	const messageBytes = textEncoder.encode(message)
	return concatBytes(
		encodeVarint((2 << 3) | 2),
		encodeVarint(messageBytes.length),
		messageBytes,
	)
}
