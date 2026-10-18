// Turns one SAN move into words, in two forms: `text` for showing on screen and
// `speech` for the speech engine (letters can be spelled out so they don't get
// misread, e.g. a lone "a" as the article).

export type LetterStyle = "letters" | "spelled" | "nato";
export type PawnStyle = "square" | "pawn-to";

export interface WordOptions {
	letters: LetterStyle;
	pawns: PawnStyle;
	/** Put a comma between letter and number ("b, 5") for a tiny pause. */
	squareComma: boolean;
}

export interface Words {
	text: string;
	speech: string;
}

const PIECES: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" };

const SPELLED: Record<string, string> = {
	a: "ay", b: "bee", c: "see", d: "dee", e: "ee", f: "eff", g: "gee", h: "aitch",
};

const NATO: Record<string, string> = {
	a: "alpha", b: "bravo", c: "charlie", d: "delta", e: "echo", f: "foxtrot", g: "golf", h: "hotel",
};

const SAN_RE = /^(?:(O-O-O)|(O-O)|([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?)([+#])?$/;

export function moveWords(san: string, flags: string, opts: WordOptions): Words {
	const m = SAN_RE.exec(san.replace(/[!?]+$/, ""));
	if (!m) return { text: san, speech: san };
	const [, long, short, piece, fromFile, fromRank, capture, to, promotion, check] = m;

	// Each part is [text, speech].
	const parts: [string, string][] = [];
	const word = (w: string) => parts.push([w, w]);

	if (long) word("castles queenside");
	else if (short) word("castles kingside");
	else if (piece) {
		word(PIECES[piece]);
		if (fromFile && fromRank) parts.push([fromFile + fromRank, square(fromFile + fromRank, opts)]);
		else if (fromFile) parts.push([fromFile, letter(fromFile, opts)]);
		else if (fromRank) word(fromRank);
		word(capture ? "takes" : "to");
		parts.push([to, square(to, opts)]);
	} else {
		// Pawn move; for captures fromFile is the pawn's file.
		if (capture && fromFile) {
			parts.push([fromFile, letter(fromFile, opts)]);
			word("takes");
		} else if (opts.pawns === "pawn-to") {
			word("pawn to");
		}
		parts.push([to, square(to, opts)]);
		if (flags.includes("e")) word("en passant");
		if (promotion) word(`promotes to ${PIECES[promotion].toLowerCase()}`);
	}

	let text = parts.map((p) => p[0]).join(" ");
	let speech = parts.map((p) => p[1]).join(" ");
	if (check === "+") {
		text += ", check";
		speech += ", check";
	} else if (check === "#") {
		text += ", checkmate";
		speech += ", checkmate";
	}
	return { text: capitalise(text), speech: capitalise(speech) };
}

function letter(file: string, opts: WordOptions): string {
	if (opts.letters === "spelled") return SPELLED[file];
	if (opts.letters === "nato") return NATO[file];
	return file.toUpperCase();
}

function square(sq: string, opts: WordOptions): string {
	return `${letter(sq[0], opts)}${opts.squareComma ? "," : ""} ${sq[1]}`;
}

function capitalise(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
