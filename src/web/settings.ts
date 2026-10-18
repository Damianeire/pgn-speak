import { DEFAULT_SCRIPT_SETTINGS, type ScriptSettings } from "../core/script.ts";

export type Engine = "system" | "kokoro";

export interface Settings extends ScriptSettings {
	rate: number;
	/** "system" = the device's voices; "kokoro" = the downloadable high-quality voice. */
	engine: Engine;
	voiceURI: string;
	kokoroVoice: string;
	waitBetweenMoves: boolean;
	showMoves: boolean;
	showBoard: boolean;
	flipBoard: boolean;
}

export const DEFAULTS: Settings = {
	...DEFAULT_SCRIPT_SETTINGS,
	rate: 0.9,
	engine: "system",
	voiceURI: "",
	kokoroVoice: "af_heart",
	waitBetweenMoves: false,
	showMoves: false,
	showBoard: false,
	flipBoard: false,
};

const KEY = "pgn-speak.settings.v1";

export function loadSettings(): Settings {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULTS };
		const saved = JSON.parse(raw) as Partial<Settings>;
		// Only keep known keys whose type matches the default.
		const out: Settings = { ...DEFAULTS };
		for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
			if (typeof saved[key] === typeof DEFAULTS[key]) (out as unknown as Record<string, unknown>)[key] = saved[key];
		}
		return out;
	} catch {
		return { ...DEFAULTS };
	}
}

export function saveSettings(s: Settings) {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		// Private windows and blocked storage: settings just won't persist.
	}
}
