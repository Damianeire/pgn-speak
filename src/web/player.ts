// Speaks cues one by one through a Speaker, waiting each cue's pause in
// between. Pausing and resuming restarts the current cue.

import type { Cue } from "../core/script.ts";
import type { Speaker } from "./speakers.ts";

export interface PlayerOptions {
	speaker: Speaker;
	/** Stop after each move (and its note) until the user asks for the next one. */
	waitBetweenMoves: boolean;
}

/** How many upcoming cues to get ready while the current one plays. */
const PREFETCH = 6;

export type PlayerState = "stopped" | "playing" | "paused" | "waiting" | "ended";

export class Player {
	private cues: Cue[] = [];
	private index = 0;
	private state: PlayerState = "stopped";
	private run = 0;
	private timer: number | undefined;

	constructor(
		private options: PlayerOptions,
		private onChange: (cue: Cue | null, index: number, state: PlayerState) => void,
		private onError: (err: Error) => void = () => {},
	) {}

	load(cues: Cue[]) {
		this.halt(true);
		this.cues = cues;
		this.index = 0;
		this.setState("stopped");
	}

	setOptions(options: PlayerOptions) {
		if (options.speaker !== this.options.speaker) {
			// Switching voices mid-phrase: stop the old one and pick up from the same cue.
			const wasPlaying = this.state === "playing";
			this.halt(true);
			this.options = options;
			if (wasPlaying) this.speakFrom(this.index);
			else this.setState(this.state);
			return;
		}
		this.options = options;
	}

	get playing() {
		return this.state === "playing";
	}

	toggle() {
		if (this.state === "playing") this.pause();
		else this.play();
	}

	play() {
		if (this.cues.length === 0) return;
		if (this.state === "ended") this.index = 0;
		if (this.state === "waiting") this.index++;
		this.speakFrom(this.index);
	}

	pause() {
		if (this.state !== "playing") return;
		this.halt(true);
		this.setState("paused");
	}

	/** Jump to the start of the next ply's cues. */
	next() {
		const ply = this.currentPly();
		const target = this.cues.findIndex((c) => c.ply > ply);
		this.jump(target === -1 ? this.cues.length - 1 : target);
	}

	/** Jump to the start of the previous ply (or the start of this one if just begun). */
	previous() {
		const ply = this.currentPly();
		const start = this.startOf(ply);
		const target = this.index > start && this.state !== "waiting" ? start : this.startOf(Math.max(0, ply - 1));
		this.jump(target);
	}

	repeat() {
		this.jump(this.startOf(this.currentPly()));
	}

	restart() {
		this.jump(0);
	}

	/** Move to the start of a ply without speaking (used after settings change). */
	seekPly(ply: number) {
		this.halt(true);
		const i = this.cues.findIndex((c) => c.ply >= ply);
		this.index = i === -1 ? 0 : i;
		this.setState(ply > 0 ? "paused" : "stopped");
	}

	get ply(): number {
		return this.currentPly();
	}

	stop() {
		this.halt(true);
		this.index = 0;
		this.setState("stopped");
	}

	private jump(target: number) {
		const resume = this.state === "playing" || this.state === "waiting";
		this.halt(true);
		this.index = Math.max(0, target);
		if (resume) this.speakFrom(this.index);
		else this.setState(this.state === "ended" ? "paused" : this.state);
	}

	private currentPly(): number {
		return this.cues[Math.min(this.index, this.cues.length - 1)]?.ply ?? 0;
	}

	private startOf(ply: number): number {
		const i = this.cues.findIndex((c) => c.ply === ply);
		return i === -1 ? 0 : i;
	}

	private speakFrom(index: number) {
		this.halt();
		const run = this.run;
		this.index = index;
		const cue = this.cues[index];
		if (!cue) {
			this.setState("ended");
			return;
		}
		this.setState("playing");

		const speaker = this.options.speaker;
		speaker.prefetch?.(this.cues.slice(index + 1, index + 1 + PREFETCH).map((c) => c.speech));
		const done = () => {
			if (run !== this.run) return;
			const nextCue = this.cues[index + 1];
			if (!nextCue) {
				this.index = index;
				this.setState("ended");
				return;
			}
			if (this.options.waitBetweenMoves && nextCue.ply !== cue.ply && cue.ply > 0) {
				this.index = index;
				this.setState("waiting");
				return;
			}
			this.timer = window.setTimeout(() => {
				if (run === this.run) this.speakFrom(index + 1);
			}, cue.pauseAfterMs);
		};
		speaker.speak(cue.speech).then(done, (err: Error) => {
			if (run !== this.run) return;
			this.halt(true);
			this.setState("paused");
			this.onError(err);
		});
	}

	/**
	 * Cancel speech and timers; invalidates callbacks from the old run. `leaving`
	 * means playback won't simply carry on to the next cue, so phrases prepared
	 * ahead can be dropped.
	 */
	private halt(leaving = false) {
		this.run++;
		window.clearTimeout(this.timer);
		this.options.speaker.stop();
		if (leaving) this.options.speaker.reset?.();
	}

	private setState(state: PlayerState) {
		this.state = state;
		this.onChange(this.cues[this.index] ?? null, this.index, state);
	}
}
