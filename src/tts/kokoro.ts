// Main-thread side of the Kokoro voice: starts the worker on demand, caches
// generated phrases ("White", "Move 12" and so on repeat a lot), and reports
// download progress.

import type { Device, WorkerReply, WorkerRequest } from "./worker.ts";

export interface KokoroVoice {
	id: string;
	label: string;
}

// Kokoro's better-rated English voices (its own grades, A to C+).
export const KOKORO_VOICES: KokoroVoice[] = [
	{ id: "af_heart", label: "Heart (US, female)" },
	{ id: "af_bella", label: "Bella (US, female)" },
	{ id: "af_nicole", label: "Nicole (US, female, soft)" },
	{ id: "bf_emma", label: "Emma (UK, female)" },
	{ id: "am_michael", label: "Michael (US, male)" },
	{ id: "am_fenrir", label: "Fenrir (US, male)" },
	{ id: "am_puck", label: "Puck (US, male)" },
	{ id: "bm_george", label: "George (UK, male)" },
	{ id: "bm_fable", label: "Fable (UK, male)" },
];

export const KOKORO_SAMPLE_RATE = 24000;

export interface Clip {
	samples: Float32Array<ArrayBuffer>;
	sampleRate: number;
}

type Pending = { key: string; resolve: (c: Clip) => void; reject: (e: Error) => void };

export class KokoroClient {
	private worker: Worker | null = null;
	private ready: Promise<void> | null = null;
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private cache = new Map<string, Promise<Clip>>();
	private progressListeners = new Set<(loaded: number, total: number) => void>();

	constructor(private device: Device = "wasm") {}

	/** Drop every phrase still waiting to be generated (they reject with "cancelled"). */
	cancelPending() {
		if (!this.worker) return;
		this.send({ type: "cancel" });
		// Settle them now, so a phrase asked for again right away starts afresh
		// instead of picking up a result that is about to be cancelled.
		for (const p of this.pending.values()) {
			this.cache.delete(p.key);
			p.reject(new Error("cancelled"));
		}
		this.pending.clear();
	}

	/** Whether this page can run the voice at all (module workers, not a file:// page). */
	static get supported(): boolean {
		return typeof Worker !== "undefined" && location.protocol !== "file:" && typeof AudioContext !== "undefined";
	}

	get loaded(): boolean {
		return this.readyState === "ready";
	}

	private readyState: "idle" | "loading" | "ready" = "idle";
	private failLoad: ((e: Error) => void) | null = null;

	onProgress(fn: (loaded: number, total: number) => void): () => void {
		this.progressListeners.add(fn);
		return () => this.progressListeners.delete(fn);
	}

	/** Download (or read from cache) and start the model. Safe to call repeatedly. */
	load(): Promise<void> {
		if (this.ready) return this.ready;
		this.readyState = "loading";
		const worker = this.ensureWorker();
		this.ready = new Promise<void>((resolve, reject) => {
			const fail = (err: Error) => {
				worker.removeEventListener("message", onMessage);
				this.readyState = "idle";
				this.ready = null;
				this.failLoad = null;
				reject(err);
			};
			this.failLoad = fail;
			const onMessage = (e: MessageEvent<WorkerReply>) => {
				if (e.data.type === "ready") {
					worker.removeEventListener("message", onMessage);
					this.readyState = "ready";
					this.failLoad = null;
					resolve();
				} else if (e.data.type === "error" && e.data.id === undefined) {
					fail(new Error(e.data.message));
				}
			};
			worker.addEventListener("message", onMessage);
			this.send({ type: "load", device: this.device });
		});
		return this.ready;
	}

	/** Speech for one phrase; identical requests share one result. */
	synth(text: string, voice: string, speed: number): Promise<Clip> {
		const key = `${voice}|${speed}|${text}`;
		let clip = this.cache.get(key);
		if (!clip) {
			clip = this.load().then(
				() =>
					new Promise<Clip>((resolve, reject) => {
						const id = this.nextId++;
						this.pending.set(id, { key, resolve, reject });
						this.send({ type: "synth", id, text, voice, speed });
					}),
			);
			// Don't keep failures around; a retry should try again.
			clip.catch(() => this.cache.delete(key));
			this.cache.set(key, clip);
		}
		return clip;
	}

	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		const worker = new Worker(new URL("tts-worker.js", document.baseURI), { type: "module" });
		worker.addEventListener("message", (e: MessageEvent<WorkerReply>) => {
			const msg = e.data;
			if (msg.type === "progress") {
				for (const fn of this.progressListeners) fn(msg.loaded, msg.total);
			} else if (msg.type === "audio") {
				this.pending.get(msg.id)?.resolve({ samples: msg.samples, sampleRate: msg.sampleRate });
				this.pending.delete(msg.id);
			} else if (msg.type === "error" && msg.id !== undefined) {
				this.pending.get(msg.id)?.reject(new Error(msg.message));
				this.pending.delete(msg.id);
			}
		});
		worker.addEventListener("error", (e) => {
			const err = new Error(e.message || "The voice worker failed to start.");
			for (const p of this.pending.values()) p.reject(err);
			this.pending.clear();
			this.failLoad?.(err);
			// Start a fresh worker next time.
			worker.terminate();
			this.worker = null;
		});
		this.worker = worker;
		return worker;
	}

	private send(msg: WorkerRequest) {
		this.ensureWorker().postMessage(msg);
	}
}
