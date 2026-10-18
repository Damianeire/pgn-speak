// Builds the list of cues the player speaks, one short phrase at a time, each
// followed by its pause.

import type { Game, Ply } from "./game.ts";
import { moveWords, type WordOptions } from "./speech.ts";

export type AnnotationLevel = "off" | "blunders" | "mistakes" | "inaccuracies";

export interface ScriptSettings extends WordOptions {
	pauseBetweenMovesMs: number;
	pauseAfterColourMs: number;
	sayIntro: boolean;
	sayMoveNumbers: boolean;
	sayColour: boolean;
	annotations: AnnotationLevel;
	/** How many moves of the better line to read (0 = only say it was a mistake). */
	alternativeLength: number;
}

export const DEFAULT_SCRIPT_SETTINGS: ScriptSettings = {
	pauseBetweenMovesMs: 6000,
	pauseAfterColourMs: 600,
	sayIntro: true,
	sayMoveNumbers: true,
	sayColour: true,
	letters: "letters",
	pawns: "pawn-to",
	squareComma: false,
	annotations: "off",
	alternativeLength: 1,
};

export type CueKind = "intro" | "number" | "colour" | "move" | "note" | "result";

export interface Cue {
	kind: CueKind;
	text: string;
	speech: string;
	pauseAfterMs: number;
	/** The ply this cue belongs to (0 for the intro). Used for skipping and the board. */
	ply: number;
}

type Quality = "blunder" | "mistake" | "inaccuracy";

const SHORT_PAUSE_MS = 400;

export function buildScript(game: Game, s: ScriptSettings): Cue[] {
	const cues: Cue[] = [];
	const say = (kind: CueKind, ply: number, text: string, pauseAfterMs: number, speech = text) =>
		cues.push({ kind, text, speech, pauseAfterMs, ply });

	if (s.sayIntro) {
		const intro = introText(game.headers);
		if (intro) say("intro", 0, intro, s.pauseBetweenMovesMs);
	}

	game.plies.forEach((ply, n) => {
		const first = n === 0;
		if (s.sayMoveNumbers && (ply.color === "w" || first)) {
			say("number", ply.index, `Move ${ply.moveNumber}`, s.pauseAfterColourMs);
		}
		if (s.sayColour) say("colour", ply.index, ply.color === "w" ? "White" : "Black", s.pauseAfterColourMs);

		const words = moveWords(ply.san, ply.flags, s);
		const note = annotation(ply, s);
		say("move", ply.index, words.text, note ? SHORT_PAUSE_MS : s.pauseBetweenMovesMs, words.speech);
		if (note) say("note", ply.index, note.text, s.pauseBetweenMovesMs, note.speech);
	});

	const last = game.plies.length;
	const result = resultText(game.result);
	if (game.error) say("result", last, `The game stops here: ${game.error}`, 0);
	else if (result) say("result", last, result, 0);

	// No point waiting after the final cue.
	if (cues.length > 0) cues[cues.length - 1].pauseAfterMs = 0;
	return cues;
}

function annotation(ply: Ply, s: ScriptSettings): { text: string; speech: string } | null {
	if (s.annotations === "off") return null;
	const quality = qualityOf(ply);
	if (!quality) return null;
	const wanted: Record<Exclude<AnnotationLevel, "off">, Quality[]> = {
		blunders: ["blunder"],
		mistakes: ["blunder", "mistake"],
		inaccuracies: ["blunder", "mistake", "inaccuracy"],
	};
	if (!wanted[s.annotations].includes(quality)) return null;

	const label = { blunder: "A blunder.", mistake: "A mistake.", inaccuracy: "An inaccuracy." }[quality];
	const line = ply.alternatives[0]?.slice(0, s.alternativeLength) ?? [];
	if (s.alternativeLength === 0 || line.length === 0) return { text: label, speech: label };

	const moves = line.map((m) => moveWords(m.san, m.flags, s));
	const join = (key: "text" | "speech") =>
		moves.map((w, i) => (i === 0 ? w[key] : `then ${w[key]}`)).join(", ");
	return {
		text: `${label} Better was ${join("text")}.`,
		speech: `${label} Better was ${join("speech")}.`,
	};
}

/** NAGs first; Lichess-style comments ("Blunder. Nf3 was best.") as a fallback. */
export function qualityOf(ply: Ply): Quality | null {
	if (ply.nags.includes(4)) return "blunder";
	if (ply.nags.includes(2)) return "mistake";
	if (ply.nags.includes(6)) return "inaccuracy";
	const comment = ply.comments.join(" ");
	if (/\bBlunder\b/.test(comment)) return "blunder";
	if (/\bMistake\b/.test(comment)) return "mistake";
	if (/\bInaccuracy\b/.test(comment)) return "inaccuracy";
	return null;
}

export function introText(h: Record<string, string>): string {
	const white = playerName(h.White);
	const black = playerName(h.Black);
	const parts: string[] = [];
	if (white && black) parts.push(`${white} versus ${black}`);
	const event = known(h.Event);
	if (event) parts.push(event);
	const date = spokenDate(h.Date);
	if (date) parts.push(date);
	return parts.length > 0 ? parts.join(", ") + "." : "";
}

/** "Carlsen, Magnus" → "Magnus Carlsen". */
export function playerName(raw: string | undefined): string {
	const name = known(raw);
	if (!name) return "";
	const m = /^([^,]+),\s*(.+)$/.exec(name);
	return m ? `${m[2]} ${m[1]}` : name;
}

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

/** PGN dates look like "2019.04.12", "2019.??.??" or "????.??.??". */
export function spokenDate(raw: string | undefined): string {
	const m = /^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/.exec(raw ?? "");
	if (!m) return "";
	const [, year, month, day] = m;
	const mi = Number(month) - 1;
	if (month === "??" || !MONTHS[mi]) return year;
	if (day === "??") return `${MONTHS[mi]} ${year}`;
	return `${Number(day)} ${MONTHS[mi]} ${year}`;
}

function resultText(result: string): string {
	switch (result) {
		case "1-0": return "White wins.";
		case "0-1": return "Black wins.";
		case "1/2-1/2": return "Draw.";
		default: return "";
	}
}

function known(v: string | undefined): string {
	const t = (v ?? "").trim();
	return t === "" || t === "?" || /^\?+$/.test(t) ? "" : t;
}
