// MP3 encoding with lamejs (LGPL-3.0). Kept in its own file, separate from the
// MIT-licensed app bundle, so it can be swapped for any other build of LAME.

import { Mp3Encoder } from "@breezystack/lamejs";

export interface Mp3Request {
	samples: Float32Array<ArrayBuffer>;
	sampleRate: number;
	kbps: number;
}

export type Mp3Reply =
	| { type: "progress"; done: number }
	| { type: "done"; bytes: ArrayBuffer }
	| { type: "error"; message: string };

const post = (msg: Mp3Reply, transfer: Transferable[] = []) =>
	(self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<Mp3Request>) => {
	try {
		const { samples, sampleRate, kbps } = e.data;
		const encoder = new Mp3Encoder(1, sampleRate, kbps);
		const chunks: Uint8Array[] = [];
		const block = 1152 * 64;
		const pcm = new Int16Array(block);
		for (let start = 0; start < samples.length; start += block) {
			const end = Math.min(start + block, samples.length);
			for (let i = start; i < end; i++) {
				const s = Math.max(-1, Math.min(1, samples[i]));
				pcm[i - start] = s < 0 ? s * 0x8000 : s * 0x7fff;
			}
			const out = encoder.encodeBuffer(pcm.subarray(0, end - start));
			if (out.length) chunks.push(new Uint8Array(out));
			post({ type: "progress", done: end / samples.length });
		}
		const tail = encoder.flush();
		if (tail.length) chunks.push(new Uint8Array(tail));

		const total = chunks.reduce((n, c) => n + c.length, 0);
		const bytes = new Uint8Array(total);
		let offset = 0;
		for (const c of chunks) {
			bytes.set(c, offset);
			offset += c.length;
		}
		post({ type: "done", bytes: bytes.buffer }, [bytes.buffer]);
	} catch (err) {
		post({ type: "error", message: (err as Error).message ?? String(err) });
	}
};
