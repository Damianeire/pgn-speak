// Replays a parsed game with chess.js so every move is known to be legal and
// carries the position after it (for the optional board).

import { Chess, DEFAULT_POSITION } from "chess.js";
import type { PgnGame, PgnMove } from "./pgn.ts";

export interface Ply {
	/** 1-based ply index in the main line. */
	index: number;
	moveNumber: number;
	color: "w" | "b";
	san: string;
	from: string;
	to: string;
	/** chess.js flags: "e" en passant, "k"/"q" castling, "p" promotion, ... */
	flags: string;
	fenAfter: string;
	nags: number[];
	comments: string[];
	/** Legal alternatives to this move (main line of each variation only). */
	alternatives: AltMove[][];
}

export interface AltMove {
	san: string;
	flags: string;
	color: "w" | "b";
}

export interface Game {
	headers: Record<string, string>;
	startFen: string;
	plies: Ply[];
	result: string;
	/** Set when the main line hit an illegal move; plies stop just before it. */
	error?: string;
}

export function replay(pgn: PgnGame): Game {
	const startFen = pgn.headers.FEN && pgn.headers.SetUp !== "0" ? pgn.headers.FEN : DEFAULT_POSITION;
	const board = new Chess(startFen);
	const plies: Ply[] = [];
	let error: string | undefined;

	for (const move of pgn.moves) {
		const before = board.fen();
		const color = board.turn();
		const moveNumber = board.moveNumber();
		const played = tryMove(board, move.san);
		if (!played) {
			error = `Illegal or unreadable move: ${moveNumber}${color === "w" ? "." : "..."} ${move.san}`;
			break;
		}
		plies.push({
			index: plies.length + 1,
			moveNumber,
			color,
			san: played.san,
			from: played.from,
			to: played.to,
			flags: played.flags,
			fenAfter: board.fen(),
			nags: move.nags,
			comments: move.comments,
			alternatives: move.variations
				.map((line) => replayLine(before, line))
				.filter((line) => line.length > 0),
		});
	}

	return { headers: pgn.headers, startFen, plies, result: pgn.result, error };
}

function replayLine(fen: string, line: PgnMove[]): AltMove[] {
	const board = new Chess(fen);
	const out: AltMove[] = [];
	for (const move of line) {
		const color = board.turn();
		const played = tryMove(board, move.san);
		if (!played) break;
		out.push({ san: played.san, flags: played.flags, color });
	}
	return out;
}

function tryMove(board: Chess, san: string) {
	try {
		return board.move(san, { strict: false });
	} catch {
		return null;
	}
}
