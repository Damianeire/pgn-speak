// A small PGN reader that keeps the structure the speech layer needs:
// tags, main line, NAGs, comments and (nested) variations.
// Move legality is checked later in game.ts with chess.js.

export interface PgnMove {
	san: string;
	nags: number[];
	comments: string[];
	/** Alternatives to this move: each one starts from the position before it. */
	variations: PgnMove[][];
}

export interface PgnGame {
	headers: Record<string, string>;
	moves: PgnMove[];
	result: string;
}

const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "½-½", "*"]);

const SUFFIX_NAGS: Record<string, number> = {
	"!": 1,
	"?": 2,
	"!!": 3,
	"??": 4,
	"!?": 5,
	"?!": 6,
};

export function parsePgn(text: string): PgnGame[] {
	const games: PgnGame[] = [];
	const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

	let game = newGame();
	// Stack of lines; the top is the line moves are currently added to.
	let stack: PgnMove[][] = [game.moves];
	let i = 0;

	const finish = () => {
		if (game.moves.length > 0 || Object.keys(game.headers).length > 0) {
			if (!game.result) game.result = game.headers.Result ?? "*";
			games.push(game);
		}
		game = newGame();
		stack = [game.moves];
	};

	const lastMove = (): PgnMove | undefined => {
		const line = stack[stack.length - 1];
		return line[line.length - 1];
	};

	while (i < src.length) {
		const ch = src[i];

		if (/\s/.test(ch)) {
			i++;
			continue;
		}

		// "%" at the start of a line escapes the whole line.
		if (ch === "%" && (i === 0 || src[i - 1] === "\n")) {
			i = lineEnd(src, i);
			continue;
		}

		if (ch === "[") {
			const end = src.indexOf("]", i);
			const raw = src.slice(i, end === -1 ? src.length : end + 1);
			const m = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/.exec(raw);
			// A tag after moves means a new game started without a result token.
			if (game.moves.length > 0 && stack.length === 1) finish();
			if (m) game.headers[m[1]] = m[2].replace(/\\(.)/g, "$1");
			i = end === -1 ? src.length : end + 1;
			continue;
		}

		if (ch === "{") {
			const end = src.indexOf("}", i);
			const body = src.slice(i + 1, end === -1 ? src.length : end).trim();
			lastMove()?.comments.push(body);
			i = end === -1 ? src.length : end + 1;
			continue;
		}

		if (ch === ";") {
			const end = lineEnd(src, i);
			lastMove()?.comments.push(src.slice(i + 1, end).trim());
			i = end;
			continue;
		}

		if (ch === "(") {
			const parent = lastMove();
			const line: PgnMove[] = [];
			// A variation with no move before it has nothing to attach to; parse and drop it.
			parent?.variations.push(line);
			stack.push(line);
			i++;
			continue;
		}

		if (ch === ")") {
			if (stack.length > 1) stack.pop();
			i++;
			continue;
		}

		const tokenMatch = /^[^\s{}()[\];]+/.exec(src.slice(i, i + 64));
		if (!tokenMatch) {
			i++;
			continue;
		}
		let token = tokenMatch[0];
		i += token.length;

		if (token.startsWith("$")) {
			const n = Number(token.slice(1));
			if (Number.isFinite(n)) lastMove()?.nags.push(n);
			continue;
		}

		if (RESULTS.has(token)) {
			if (stack.length === 1) {
				game.result = token === "½-½" ? "1/2-1/2" : token;
				finish();
			}
			continue;
		}

		// Move numbers, possibly glued to the move: "12.", "12...", "12.Nf3".
		token = token.replace(/^\d+\.+/, "");
		if (token === "" || /^\d+$/.test(token) || token === "e.p.") continue;

		const sanMatch = /^(.*?)([!?]{1,2})?$/.exec(token)!;
		const san = normaliseSan(sanMatch[1]);
		if (!san) continue;
		const move: PgnMove = { san, nags: [], comments: [], variations: [] };
		const suffix = sanMatch[2];
		if (suffix && SUFFIX_NAGS[suffix]) move.nags.push(SUFFIX_NAGS[suffix]);
		stack[stack.length - 1].push(move);
	}

	finish();
	return games;
}

function newGame(): PgnGame {
	return { headers: {}, moves: [], result: "" };
}

function lineEnd(src: string, from: number): number {
	const end = src.indexOf("\n", from);
	return end === -1 ? src.length : end;
}

function normaliseSan(san: string): string {
	return san
		.replace(/^0-0-0/, "O-O-O")
		.replace(/^0-0/, "O-O")
		.replace(/e\.p\.$/, "");
}
