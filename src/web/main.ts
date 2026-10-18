import { parsePgn, type PgnGame } from "../core/pgn.ts";
import { replay, type Game } from "../core/game.ts";
import { buildScript, playerName, qualityOf, type Cue } from "../core/script.ts";
import { KOKORO_VOICES, KokoroClient } from "../tts/kokoro.ts";
import { renderBoard } from "./board.ts";
import { exportMp3, mp3FileName } from "./export.ts";
import { Player, type PlayerState } from "./player.ts";
import { KokoroSpeaker, SystemSpeaker } from "./speakers.ts";
import { SAMPLE_PGN } from "./samples.ts";
import { loadSettings, saveSettings, type Settings } from "./settings.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
	pgn: $<HTMLTextAreaElement>("pgn"),
	load: $<HTMLButtonElement>("load"),
	file: $<HTMLInputElement>("file"),
	sample: $<HTMLButtonElement>("sample"),
	lichessForm: $<HTMLFormElement>("lichess-form"),
	lichessUrl: $<HTMLInputElement>("lichess-url"),
	message: $<HTMLParagraphElement>("message"),
	gamePick: $<HTMLDivElement>("game-pick"),
	gameSelect: $<HTMLSelectElement>("game-select"),
	title: $<HTMLParagraphElement>("title"),
	position: $<HTMLParagraphElement>("position"),
	caption: $<HTMLParagraphElement>("caption"),
	restart: $<HTMLButtonElement>("restart"),
	prev: $<HTMLButtonElement>("prev"),
	play: $<HTMLButtonElement>("play"),
	next: $<HTMLButtonElement>("next"),
	repeat: $<HTMLButtonElement>("repeat"),
	board: $<HTMLDivElement>("board"),
	moves: $<HTMLOListElement>("moves"),
	settings: $<HTMLFormElement>("settings"),
	voice: $<HTMLSelectElement>("voice"),
	engine: $<HTMLSelectElement>("engine"),
	systemVoiceRow: $<HTMLDivElement>("system-voice-row"),
	kokoroVoiceRow: $<HTMLDivElement>("kokoro-voice-row"),
	kokoroVoice: $<HTMLSelectElement>("kokoro-voice"),
	kokoroStatus: $<HTMLParagraphElement>("kokoro-status"),
	kokoroProgress: $<HTMLProgressElement>("kokoro-progress"),
	mp3: $<HTMLButtonElement>("mp3"),
	mp3Cancel: $<HTMLButtonElement>("mp3-cancel"),
	mp3Progress: $<HTMLProgressElement>("mp3-progress"),
	mp3Status: $<HTMLParagraphElement>("mp3-status"),
};

let settings: Settings = loadSettings();
let games: PgnGame[] = [];
let game: Game | null = null;
let cues: Cue[] = [];
let shownPly = 0;

const supported = "speechSynthesis" in window;
const kokoroSupported = KokoroClient.supported;
if (!kokoroSupported && settings.engine === "kokoro") settings = { ...settings, engine: "system" };

const kokoro = new KokoroClient();
const systemSpeaker = new SystemSpeaker(() => ({ voice: systemVoice(), rate: settings.rate }));
const kokoroSpeaker = new KokoroSpeaker(kokoro, () => ({ voice: settings.kokoroVoice, speed: settings.rate }));
const player = new Player(playerOptions(), onPlayerChange, (err) => showMessage(`Speech stopped: ${err.message}`, true));
let exporting: AbortController | null = null;

// ---------- Loading games ----------

function loadText(text: string, source: string) {
	games = parsePgn(text).filter((g) => g.moves.length > 0);
	if (games.length === 0) {
		showMessage(`No moves found in ${source}.`, true);
		return;
	}
	ui.gameSelect.replaceChildren(
		...games.map((g, i) => {
			const o = document.createElement("option");
			o.value = String(i);
			o.textContent = `${i + 1}. ${gameLabel(g.headers)}`;
			return o;
		}),
	);
	ui.gamePick.hidden = games.length < 2;
	selectGame(0);
	showMessage(games.length > 1 ? `${games.length} games found in ${source}.` : `Loaded from ${source}.`);
}

function selectGame(i: number) {
	game = replay(games[i]);
	if (game.error) showMessage(game.error + ". Reading the moves before it.", true);
	ui.title.textContent = gameLabel(game.headers);
	rebuild(0);
	renderMoves();
}

function rebuild(atPly: number) {
	if (!game) return;
	cues = buildScript(game, settings);
	player.load(cues);
	if (atPly > 0) player.seekPly(atPly);
	updateControls("stopped");
}

function gameLabel(h: Record<string, string>): string {
	const w = playerName(h.White) || "White";
	const b = playerName(h.Black) || "Black";
	const year = /^\d{4}/.exec(h.Date ?? "")?.[0];
	return `${w} – ${b}${year ? ` (${year})` : ""}`;
}

async function fetchLichess(url: string) {
	const id = /lichess\.org\/(?:embed\/)?(?:game\/export\/)?([A-Za-z0-9]{8})/.exec(url)?.[1];
	if (!id) {
		showMessage("That doesn't look like a Lichess game link.", true);
		return;
	}
	showMessage("Fetching from Lichess…");
	try {
		// literate=1 adds "Blunder. X was best." comments to analysed games.
		const res = await fetch(`https://lichess.org/game/export/${id}?literate=1&clocks=false&evals=false`);
		if (!res.ok) throw new Error(`Lichess answered ${res.status}`);
		const text = await res.text();
		ui.pgn.value = text;
		loadText(text, "Lichess");
	} catch (e) {
		showMessage(`Couldn't fetch that game (${(e as Error).message}). You can paste the PGN instead.`, true);
	}
}

function showMessage(text: string, error = false) {
	ui.message.textContent = text;
	ui.message.classList.toggle("error", error);
}

// ---------- Player display ----------

function onPlayerChange(cue: Cue | null, _index: number, state: PlayerState) {
	updateControls(state);
	if (!game) return;
	const ply = cue?.ply ?? 0;
	// Show the position once the move itself is being said (not on "Move 14").
	const reached = cue && (cue.kind === "move" || cue.kind === "note" || cue.kind === "result") ? ply : Math.max(0, ply - 1);
	showPly(reached);
	if (settings.showMoves && cue && state === "playing") ui.caption.textContent = cue.text;
	else if (!settings.showMoves) ui.caption.textContent = "";

	const p = game.plies[ply - 1];
	ui.position.textContent = p ? `Move ${p.moveNumber} · ${p.color === "w" ? "White" : "Black"} · ${ply} of ${game.plies.length} half-moves` : "Start";
}

function updateControls(state: PlayerState) {
	const has = cues.length > 0 && (settings.engine === "kokoro" ? kokoroSupported : supported);
	for (const b of [ui.restart, ui.prev, ui.play, ui.next, ui.repeat]) b.disabled = !has;
	const playing = state === "playing";
	ui.play.textContent = playing ? "⏸" : "▶";
	ui.play.setAttribute("aria-label", playing ? "Pause" : state === "waiting" ? "Next move" : "Play");
	ui.mp3.disabled = cues.length === 0 || !kokoroSupported || exporting !== null;
}

function showPly(ply: number) {
	shownPly = ply;
	if (!game) return;
	if (settings.showBoard) {
		const p = game.plies[ply - 1];
		renderBoard(ui.board, p ? p.fenAfter : game.startFen, settings.flipBoard, p ? [p.from, p.to] : []);
	}
	ui.moves.querySelectorAll("span.current").forEach((s) => s.classList.remove("current"));
	ui.moves.querySelector(`span[data-ply="${ply}"]`)?.classList.add("current");
}

function renderMoves() {
	if (!game) return;
	const items: HTMLLIElement[] = [];
	for (const p of game.plies) {
		if (p.color === "w" || items.length === 0) {
			const li = document.createElement("li");
			li.value = p.moveNumber;
			if (p.color === "b") li.append("… ");
			items.push(li);
		}
		const span = document.createElement("span");
		span.dataset.ply = String(p.index);
		span.textContent = p.san;
		if (qualityOf(p)) span.classList.add("flag");
		const li = items[items.length - 1];
		if (li.childNodes.length > 0) li.append(" ");
		li.append(span);
	}
	ui.moves.replaceChildren(...items);
	applyReveal();
}

function applyReveal() {
	ui.board.hidden = !settings.showBoard || !game;
	ui.moves.hidden = !settings.showMoves || !game;
	if (!settings.showMoves) ui.caption.textContent = "";
	showPly(shownPly);
}

// ---------- Settings ----------

function systemVoice(): SpeechSynthesisVoice | null {
	return supported ? speechSynthesis.getVoices().find((v) => v.voiceURI === settings.voiceURI) ?? null : null;
}

function playerOptions() {
	const speaker = settings.engine === "kokoro" ? kokoroSpeaker : systemSpeaker;
	return { speaker, waitBetweenMoves: settings.waitBetweenMoves };
}

function fillSettingsForm() {
	for (const el of Array.from(ui.settings.elements)) {
		const input = el as HTMLInputElement | HTMLSelectElement;
		const key = input.name as keyof Settings;
		if (!key || !(key in settings)) continue;
		const value = settings[key];
		if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(value);
		else input.value = String(value);
	}
	updateOutputs();
}

function updateOutputs() {
	const fmt: Partial<Record<keyof Settings, (v: number) => string>> = {
		pauseBetweenMovesMs: (v) => `${(v / 1000).toFixed(1)} s`,
		pauseAfterColourMs: (v) => `${(v / 1000).toFixed(1)} s`,
		rate: (v) => `${v.toFixed(2)}×`,
	};
	ui.settings.querySelectorAll<HTMLOutputElement>("output[data-for]").forEach((o) => {
		const key = o.dataset.for as keyof Settings;
		o.textContent = fmt[key]?.(Number(settings[key])) ?? "";
	});
}

function readSettingsForm(target: HTMLInputElement | HTMLSelectElement) {
	const key = target.name as keyof Settings;
	if (!(key in settings)) return;
	const current = settings[key];
	let value: unknown;
	if (target instanceof HTMLInputElement && target.type === "checkbox") value = target.checked;
	else if (typeof current === "number") value = Number(target.value);
	else value = target.value;
	settings = { ...settings, [key]: value };
	saveSettings(settings);
	updateOutputs();

	const viewOnly: (keyof Settings)[] = ["showMoves", "showBoard", "flipBoard"];
	const playerOnly: (keyof Settings)[] = ["rate", "voiceURI", "kokoroVoice", "waitBetweenMoves"];
	if (key === "engine") {
		applyEngine();
		player.setOptions(playerOptions());
		updateControls(player.playing ? "playing" : "paused");
	} else if (viewOnly.includes(key)) applyReveal();
	else if (playerOnly.includes(key)) player.setOptions(playerOptions());
	else if (game) {
		// Script changes take effect from the current move.
		const wasPlaying = player.playing;
		rebuild(player.ply);
		if (wasPlaying) player.play();
	}
}

function fillVoices() {
	if (!supported) return;
	const voices = speechSynthesis.getVoices();
	const lang = navigator.language.slice(0, 2);
	const langRank = (v: SpeechSynthesisVoice) => (v.lang.startsWith(lang) ? 0 : v.lang.startsWith("en") ? 1 : 2);
	const sorted = [...voices].sort(
		(a, b) => langRank(a) - langRank(b) || voiceQuality(b) - voiceQuality(a) || a.name.localeCompare(b.name),
	);
	const option = (v: SpeechSynthesisVoice) => {
		const o = document.createElement("option");
		o.value = v.voiceURI;
		o.textContent = `${v.name} (${v.lang})`;
		return o;
	};
	const group = (label: string, list: SpeechSynthesisVoice[]) => {
		const g = document.createElement("optgroup");
		g.label = label;
		g.append(...list.map(option));
		return g;
	};
	const def = document.createElement("option");
	def.value = "";
	def.textContent = "Default voice";
	const best = sorted.filter((v) => voiceQuality(v) > 0 && langRank(v) < 2);
	const rest = sorted.filter((v) => !best.includes(v));
	ui.voice.replaceChildren(def, ...(best.length ? [group("Best on this device", best)] : []), group("Other voices", rest));
	ui.voice.value = settings.voiceURI;
	if (ui.voice.value !== settings.voiceURI) ui.voice.value = "";
	player.setOptions(playerOptions());
}

/** Higher for the natural-sounding voices browsers and systems offer. */
function voiceQuality(v: SpeechSynthesisVoice): number {
	const n = v.name;
	if (/premium/i.test(n)) return 4;
	if (/enhanced|natural|neural/i.test(n)) return 3;
	if (/online|google/i.test(n)) return 2;
	return 0;
}

// ---------- High-quality voice and MP3 ----------

function fillKokoroVoices() {
	ui.kokoroVoice.replaceChildren(
		...KOKORO_VOICES.map((v) => {
			const o = document.createElement("option");
			o.value = v.id;
			o.textContent = v.label;
			return o;
		}),
	);
	ui.kokoroVoice.value = settings.kokoroVoice;
}

function applyEngine() {
	const hq = settings.engine === "kokoro";
	ui.systemVoiceRow.hidden = hq;
	ui.kokoroVoiceRow.hidden = !hq;
	if (hq) void loadKokoro();
}

function megabytes(n: number) {
	return `${Math.round(n / 1e6)} MB`;
}

async function loadKokoro() {
	if (kokoro.loaded) {
		ui.kokoroStatus.textContent = "High-quality voice ready.";
		return;
	}
	ui.kokoroProgress.hidden = false;
	ui.kokoroStatus.textContent = "Getting the voice ready…";
	const off = kokoro.onProgress((loaded, total) => {
		ui.kokoroProgress.value = total ? loaded / total : 0;
		ui.kokoroStatus.textContent = total ? `Downloading the voice: ${megabytes(loaded)} of ${megabytes(total)}…` : "Downloading the voice…";
	});
	try {
		await kokoro.load();
		ui.kokoroStatus.textContent = "High-quality voice ready.";
	} catch (e) {
		ui.kokoroStatus.textContent = `Couldn't load the voice (${(e as Error).message}). Check your connection and pick it again.`;
	} finally {
		off();
		ui.kokoroProgress.hidden = true;
	}
}

async function downloadMp3() {
	if (!game || cues.length === 0 || exporting) return;
	player.pause();
	exporting = new AbortController();
	updateControls("paused");
	ui.mp3Cancel.hidden = false;
	ui.mp3Progress.hidden = false;
	ui.mp3Progress.value = 0;
	const labels = { voice: "Getting the voice ready", speaking: "Speaking the moves", encoding: "Making the MP3" };
	try {
		const blob = await exportMp3(
			// Script without "wait for me" stops: a file plays straight through.
			cues,
			kokoro,
			settings.kokoroVoice,
			settings.rate,
			(p) => {
				ui.mp3Progress.value = p.fraction;
				ui.mp3Status.textContent = `${labels[p.stage]}… ${Math.round(p.fraction * 100)}%`;
			},
			exporting.signal,
		);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = mp3FileName(game.headers);
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
		ui.mp3Status.textContent = `Saved ${a.download} (${(blob.size / 1e6).toFixed(1)} MB).`;
	} catch (e) {
		ui.mp3Status.textContent =
			(e as Error).name === "AbortError" ? "Cancelled." : `Couldn't make the MP3: ${(e as Error).message}`;
	} finally {
		exporting = null;
		ui.mp3Cancel.hidden = true;
		ui.mp3Progress.hidden = true;
		updateControls("paused");
	}
}

// ---------- Wiring ----------

ui.load.addEventListener("click", () => loadText(ui.pgn.value, "the text box"));
ui.sample.addEventListener("click", () => {
	ui.pgn.value = SAMPLE_PGN;
	loadText(SAMPLE_PGN, "the sample");
});
ui.file.addEventListener("change", async () => {
	const f = ui.file.files?.[0];
	if (!f) return;
	const text = await f.text();
	ui.pgn.value = text;
	loadText(text, f.name);
	ui.file.value = "";
});
ui.lichessForm.addEventListener("submit", (e) => {
	e.preventDefault();
	void fetchLichess(ui.lichessUrl.value.trim());
});
ui.gameSelect.addEventListener("change", () => selectGame(Number(ui.gameSelect.value)));

ui.play.addEventListener("click", () => player.toggle());
ui.next.addEventListener("click", () => player.next());
ui.prev.addEventListener("click", () => player.previous());
ui.repeat.addEventListener("click", () => player.repeat());
ui.restart.addEventListener("click", () => player.restart());
ui.mp3.addEventListener("click", () => void downloadMp3());
ui.mp3Cancel.addEventListener("click", () => {
	exporting?.abort();
	kokoro.cancelPending();
});

ui.settings.addEventListener("input", (e) => readSettingsForm(e.target as HTMLInputElement));
ui.settings.addEventListener("submit", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
	const t = e.target;
	if (t instanceof Element && t.closest("textarea, input, select")) return;
	// A focused button already reacts to space itself.
	if (t instanceof Element && t.closest("button") && e.key === " ") return;
	if (e.metaKey || e.ctrlKey || e.altKey) return;
	if (cues.length === 0) return;
	if (e.key === " ") player.toggle();
	else if (e.key === "ArrowRight") player.next();
	else if (e.key === "ArrowLeft") player.previous();
	else if (e.key === "r" || e.key === "R") player.repeat();
	else return;
	e.preventDefault();
});

// Drop a .pgn anywhere on the page.
document.addEventListener("dragover", (e) => {
	e.preventDefault();
	document.body.classList.add("dragging");
});
document.addEventListener("dragleave", (e) => {
	if (e.relatedTarget === null) document.body.classList.remove("dragging");
});
document.addEventListener("drop", async (e) => {
	e.preventDefault();
	document.body.classList.remove("dragging");
	const f = e.dataTransfer?.files[0];
	if (f) {
		const text = await f.text();
		ui.pgn.value = text;
		loadText(text, f.name);
	} else {
		const text = e.dataTransfer?.getData("text/plain");
		if (text) {
			ui.pgn.value = text;
			loadText(text, "the dropped text");
		}
	}
});

fillKokoroVoices();
fillSettingsForm();
updateControls("stopped");
if (!kokoroSupported) {
	ui.engine.querySelector<HTMLOptionElement>('option[value="kokoro"]')!.disabled = true;
	ui.mp3Status.textContent = "The high-quality voice and MP3 download work on the website, not when this page is opened as a file.";
}
applyEngine();
if (supported) {
	fillVoices();
	speechSynthesis.addEventListener("voiceschanged", fillVoices);
} else {
	showMessage("This browser can't speak text. Try a current Chrome, Safari, Edge or Firefox.", true);
}
