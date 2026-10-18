// The two ways the player can speak: the device's own voices (Web Speech API)
// or the Kokoro model running in the page.

import { KokoroClient } from "../tts/kokoro.ts";

export interface Speaker {
	/** Resolves when the phrase has finished playing (or was stopped). */
	speak(text: string): Promise<void>;
	stop(): void;
	/** Get upcoming phrases ready so there is no gap before them. */
	prefetch?(texts: string[]): void;
	/** Forget phrases got ready for a position the player has left (pause, skip). */
	reset?(): void;
}

export class SystemSpeaker implements Speaker {
	// Chrome can drop events for utterances that get garbage-collected mid-speech.
	private utterance: SpeechSynthesisUtterance | null = null;

	constructor(private get: () => { voice: SpeechSynthesisVoice | null; rate: number }) {}

	speak(text: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const { voice, rate } = this.get();
			const u = new SpeechSynthesisUtterance(text);
			if (voice) {
				u.voice = voice;
				u.lang = voice.lang;
			}
			u.rate = rate;
			u.onend = () => resolve();
			u.onerror = (e) => {
				// "interrupted"/"canceled" come from our own stop().
				if (e.error === "interrupted" || e.error === "canceled") resolve();
				else reject(new Error(`Speech failed: ${e.error}`));
			};
			this.utterance = u;
			speechSynthesis.speak(u);
		});
	}

	stop() {
		this.utterance = null;
		speechSynthesis.cancel();
	}
}

export class KokoroSpeaker implements Speaker {
	private ctx: AudioContext | null = null;
	private source: AudioBufferSourceNode | null = null;
	private finish: (() => void) | null = null;
	private generation = 0;

	constructor(
		private client: KokoroClient,
		private get: () => { voice: string; speed: number },
	) {}

	async speak(text: string): Promise<void> {
		const gen = ++this.generation;
		// Create/resume the audio context while we're still inside the click that started playback.
		const ctx = (this.ctx ??= new AudioContext());
		if (ctx.state === "suspended") void ctx.resume();
		const { voice, speed } = this.get();
		const clip = await this.client.synth(text, voice, speed);
		if (gen !== this.generation) return;

		const buffer = ctx.createBuffer(1, clip.samples.length, clip.sampleRate);
		buffer.copyToChannel(clip.samples, 0);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		await new Promise<void>((resolve) => {
			this.finish = resolve;
			source.onended = () => resolve();
			this.source = source;
			source.start();
		});
		if (this.source === source) this.source = null;
	}

	stop() {
		this.generation++;
		try {
			this.source?.stop();
		} catch {
			// Already stopped.
		}
		this.source = null;
		this.finish?.();
		this.finish = null;
	}

	prefetch(texts: string[]) {
		const { voice, speed } = this.get();
		for (const t of texts) this.client.synth(t, voice, speed).catch(() => {});
	}

	reset() {
		this.client.cancelPending();
	}
}
