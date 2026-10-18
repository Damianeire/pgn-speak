// Runs the Kokoro voice model off the main thread. The model (about 90 MB) is
// fetched from Hugging Face on first use and kept in the browser's cache.

import { KokoroTTS } from "kokoro-js";

export type Device = "wasm" | "webgpu";

export type WorkerRequest =
	| { type: "load"; device: Device }
	| { type: "cancel" }
	| { type: "synth"; id: number; text: string; voice: string; speed: number };

export type WorkerReply =
	| { type: "progress"; loaded: number; total: number }
	| { type: "ready" }
	| { type: "audio"; id: number; samples: Float32Array<ArrayBuffer>; sampleRate: number }
	| { type: "error"; id?: number; message: string };

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

type Voice = NonNullable<NonNullable<Parameters<KokoroTTS["generate"]>[1]>["voice"]>;

let tts: Promise<KokoroTTS> | null = null;
// Bytes per file, so overall progress can be summed across the model's files.
const files = new Map<string, { loaded: number; total: number }>();

const post = (msg: WorkerReply, transfer: Transferable[] = []) =>
	(self as unknown as Worker).postMessage(msg, transfer);

// WebGPU runs the full-precision model on the graphics chip; plain wasm (CPU)
// uses the smaller 8-bit model, which is what it handles best.
let device: Device = "wasm";

function load(): Promise<KokoroTTS> {
	tts ??= KokoroTTS.from_pretrained(MODEL, {
		dtype: device === "webgpu" ? "fp32" : "q8",
		device,
		progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
			if (p.status !== "progress" || !p.file) return;
			files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
			let loaded = 0;
			let total = 0;
			for (const f of files.values()) {
				loaded += f.loaded;
				total += f.total;
			}
			post({ type: "progress", loaded, total });
		},
	});
	return tts;
}

// One request at a time: the model can't run two generations at once, and the
// page may ask for several phrases ahead.
let queue: Promise<void> = Promise.resolve();

// Requests queued before a "cancel" are dropped instead of generated.
let generation = 0;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
	const msg = e.data;
	if (msg.type === "cancel") {
		generation++;
		return;
	}
	if (msg.type === "load") device = msg.device;
	const gen = generation;
	queue = queue.then(() => {
		if (msg.type === "synth" && gen !== generation) {
			post({ type: "error", id: msg.id, message: "cancelled" });
			return;
		}
		return handle(msg);
	});
};

async function handle(msg: Exclude<WorkerRequest, { type: "cancel" }>) {
	try {
		if (msg.type === "load") {
			const model = await load();
			// The first generation is much slower (it sets up the pronunciation engine
			// and compiles the model), so do it now rather than on the first move.
			await model.generate("Ready.", { voice: "af_heart" });
			post({ type: "ready" });
		} else if (msg.type === "synth") {
			const model = await load();
			const audio = await model.generate(msg.text, {
				voice: msg.voice as Voice,
				speed: msg.speed,
			});
			const samples = audio.audio as Float32Array<ArrayBuffer>;
			post({ type: "audio", id: msg.id, samples, sampleRate: audio.sampling_rate }, [samples.buffer]);
		}
	} catch (err) {
		if (msg.type === "load") tts = null;
		post({ type: "error", id: msg.type === "synth" ? msg.id : undefined, message: (err as Error).message ?? String(err) });
	}
}
