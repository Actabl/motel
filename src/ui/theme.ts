export interface ThemeColors {
	readonly screenBg: string
	readonly text: string
	readonly muted: string
	readonly separator: string
	readonly accent: string
	readonly error: string
	readonly selectedBg: string
	readonly warning: string
	readonly selectedText: string
	readonly count: string
	readonly passing: string
	readonly defaultService: string
	readonly footerBg: string
	readonly treeLine: string
	readonly previewKey: string
}

export interface ThemeWaterfallColors {
	readonly bar: string
	readonly barError: string
	readonly barBg: string
	readonly barLane: string
	readonly barSelected: string
	readonly barSelectedError: string
}

export interface ThemeDefinition {
	readonly name: ThemeName
	readonly label: string
	readonly colors: ThemeColors
	readonly waterfall: ThemeWaterfallColors
}

const motelDefaultTheme: ThemeDefinition = {
	name: "motel-default",
	label: "Motel Default",
	colors: {
		screenBg: "#1c1b29",
		text: "#ede7da",
		muted: "#9f9788",
		separator: "#6f685d",
		accent: "#f4a51c",
		error: "#f97316",
		selectedBg: "#263044",
		warning: "#facc15",
		selectedText: "#f8fafc",
		count: "#d7c5a1",
		passing: "#7dd3a3",
		defaultService: "#93c5fd",
		footerBg: "#000000",
		treeLine: "#524d45",
		previewKey: "#6a6358",
	},
	waterfall: {
		bar: "#f4a51c",
		barError: "#f97316",
		barBg: "#2a2520",
		barLane: "#4a4338",
		barSelected: "#e8c547",
		barSelectedError: "#ff8c42",
	},
}

const tokyoNightTheme: ThemeDefinition = {
	name: "tokyo-night",
	label: "Tokyo Night",
	colors: {
		screenBg: "#1a1b26",
		text: "#c0caf5",
		muted: "#7a88b6",
		separator: "#565f89",
		accent: "#7aa2f7",
		error: "#f7768e",
		selectedBg: "#283457",
		warning: "#e0af68",
		selectedText: "#f8fbff",
		count: "#bb9af7",
		passing: "#9ece6a",
		defaultService: "#73daca",
		footerBg: "#000000",
		treeLine: "#414868",
		previewKey: "#6b739c",
	},
	waterfall: {
		bar: "#7aa2f7",
		barError: "#f7768e",
		barBg: "#1f2335",
		barLane: "#2a3050",
		barSelected: "#bb9af7",
		barSelectedError: "#ff9eaf",
	},
}

const catppuccinTheme: ThemeDefinition = {
	name: "catppuccin",
	label: "Catppuccin Mocha",
	colors: {
		screenBg: "#11111b",
		text: "#cdd6f4",
		muted: "#a6adc8",
		separator: "#6c7086",
		accent: "#f5c2e7",
		error: "#f38ba8",
		selectedBg: "#313244",
		warning: "#f9e2af",
		selectedText: "#f5f7ff",
		count: "#fab387",
		passing: "#a6e3a1",
		defaultService: "#89dceb",
		footerBg: "#000000",
		treeLine: "#585b70",
		previewKey: "#9399b2",
	},
	waterfall: {
		bar: "#f5c2e7",
		barError: "#f38ba8",
		barBg: "#1e1e2e",
		barLane: "#313244",
		barSelected: "#fab387",
		barSelectedError: "#eba0ac",
	},
}

export const themes = {
	"motel-default": motelDefaultTheme,
	"tokyo-night": tokyoNightTheme,
	catppuccin: catppuccinTheme,
} as const

export type ThemeName = keyof typeof themes

export const themeOrder: readonly ThemeName[] = ["motel-default", "tokyo-night", "catppuccin"]

export const colors: ThemeColors = { ...motelDefaultTheme.colors }
export const waterfallColors: ThemeWaterfallColors = { ...motelDefaultTheme.waterfall }

export const applyTheme = (name: ThemeName) => {
	const theme = themes[name] ?? motelDefaultTheme
	Object.assign(colors, theme.colors)
	Object.assign(waterfallColors, theme.waterfall)
	return theme
}

export const cycleThemeName = (current: ThemeName) => {
	const nextIndex = (themeOrder.indexOf(current) + 1) % themeOrder.length
	return themeOrder[nextIndex] ?? themeOrder[0]
}

export const themeLabel = (name: ThemeName) => themes[name]?.label ?? motelDefaultTheme.label

export const SEPARATOR = " \u00b7 "
export const G_PREFIX_TIMEOUT_MS = 500
