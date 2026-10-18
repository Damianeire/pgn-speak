// Renders a whole game to one MP3: every cue spoken by the Kokoro voice, each
// followed by its pause as silence, encoded in a separate worker.

import type { Cue } from "../core/script.ts";
import type { KokoroClient } from "../tts/kokoro.ts";
import type { Mp3Reply, Mp3Request } from "../tts/mp3-worker.ts";

export interface ExportProgress {
	stage: "voice" | "speaking" | "encoding";
	/** 0..1 within the stage. */
	fraction: number;
}

const LEAD_IN_MS = 500;
const KBPS = 64;

export async function exportMp3(
	cues: Cue[],
	client: KokoroClient,
	voice: string,
	speed: number,
	onProgress: (p: ExportProgress) => void,
	signal: AbortSignal,
): Promise<Blob> {
	onProgress({ stage: "voice", fraction: 0 });
	const off = client.onProgress((loaded, total) => onProgress({ stage: "voice", fraction: total ? loaded / total : 0 }));
	try {
		await client.load();
	} finally {
		off();
	}

	// Same phrase, same audio: render each distinct phrase once.
	const unique = [...new Set(cues.map((c) => c.speech))];
	const clips = new Map<string, Float32Array<ArrayBuffer>>();
	let sampleRate = 24000;
	for (let i = 0; i < unique.length; i++) {
		if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
		const clip = await client.synth(unique[i], voice, speed);
		clips.set(unique[i], clip.samples);
		sampleRate = clip.sampleRate;
		onProgress({ stage: "speaking", fraction: (i + 1) / unique.length });
	}

	const silence = (ms: number) => Math.round((ms / 1000) * sampleRate);
	let length = silence(LEAD_IN_MS);
	for (const c of cues) length += clips.get(c.speech)!.length + silence(c.pauseAfterMs);
	const samples = new Float32Array(length);
	let at = silence(LEAD_IN_MS);
	for (const c of cues) {
		const clip = clips.get(c.speech)!;
		samples.set(clip, at);
		at += clip.length + silence(c.pauseAfterMs);
	}

	if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
	onProgress({ stage: "encoding", fraction: 0 });
	const bytes = await encode(samples, sampleRate, (f) => onProgress({ stage: "encoding", fraction: f }), signal);
	return new Blob([bytes], { type: "audio/mpeg" });
}

function encode(samples: Float32Array<ArrayBuffer>, sampleRate: number, onProgress: (f: number) => void, signal: AbortSignal) {
	return new Promise<ArrayBuffer>((resolve, reject) => {
		const worker = new Worker(new URL("mp3-worker.js", document.baseURI));
		const finish = () => {
			worker.terminate();
			signal.removeEventListener("abort", abort);
		};
		const abort = () => {
			finish();
			reject(new DOMException("Cancelled", "AbortError"));
		};
		signal.addEventListener("abort", abort);
		worker.onmessage = (e: MessageEvent<Mp3Reply>) => {
			const msg = e.data;
			if (msg.type === "progress") onProgress(msg.done);
			else if (msg.type === "done") {
				finish();
				resolve(msg.bytes);
			} else {
				finish();
				reject(new Error(msg.message));
			}
		};
		worker.onerror = (e) => {
			finish();
			reject(new Error(e.message || "The MP3 encoder failed to start."));
		};
		const req: Mp3Request = { samples, sampleRate, kbps: KBPS };
		worker.postMessage(req, [samples.buffer]);
	});
}

/** "Morphy vs Isouard 1858.mp3", like the old macro's file names. */
export function mp3FileName(headers: Record<string, string>): string {
	const last = (name: string | undefined) => {
		const n = (name ?? "").trim();
		if (!n || n === "?") return "";
		const comma = n.indexOf(",");
		return comma > 0 ? n.slice(0, comma).trim() : n.split(/\s+/).at(-1) ?? n;
	};
	const year = /^\d{4}/.exec(headers.Date ?? "")?.[0];
	const parts = [last(headers.White) || "White", "vs", last(headers.Black) || "Black"];
	if (year) parts.push(year);
	return parts.join(" ").replace(/[\\/:*?"<>|]+/g, "-") + ".mp3";
}
