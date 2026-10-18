import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePgn } from "../src/core/pgn.ts";
import { replay } from "../src/core/game.ts";
import { moveWords, type WordOptions } from "../src/core/speech.ts";
import { buildScript, DEFAULT_SCRIPT_SETTINGS, introText, spokenDate } from "../src/core/script.ts";

const plain: WordOptions = { letters: "letters", pawns: "square", squareComma: false };

test("reads tags, skips comments, NAGs and nested variations", () => {
	const [g] = parsePgn(`[Event "Test"]
[White "Doe, John"]
[Black "Roe, Jane"]
[Result "1-0"]

1. e4 {best by test} e5 $1 (1... c5 2. Nf3 (2. c3 d5) d6) 2. Nf3!? ; rest of line
Nc6 3. Bb5 a6 1-0`);
	assert.deepEqual(g.moves.map((m) => m.san), ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
	assert.equal(g.result, "1-0");
	assert.deepEqual(g.moves[1].nags, [1]);
	assert.deepEqual(g.moves[2].nags, [5]);
	assert.equal(g.moves[1].variations[0].length, 3);
	assert.equal(g.moves[1].variations[0][1].variations[0][0].san, "c3");
});

test("splits several games, with and without result tokens", () => {
	const games = parsePgn(`[Event "A"]\n\n1. e4 e5 *\n\n[Event "B"]\n\n1. d4 d5\n[Event "C"]\n1. c4 0-1`);
	assert.deepEqual(games.map((g) => g.headers.Event), ["A", "B", "C"]);
	assert.deepEqual(games.map((g) => g.moves[0].san), ["e4", "d4", "c4"]);
});

test("handles glued move numbers, zero castling and Lichess clock comments", () => {
	const [g] = parsePgn(`1.e4 { [%clk 0:03:00] } 1...e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0 Nf6`);
	assert.deepEqual(g.moves.map((m) => m.san), ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6"]);
});

test("replay stops at an illegal move and says where", () => {
	const game = replay(parsePgn("1. e4 e5 2. Ke3 Nc6")[0]);
	assert.equal(game.plies.length, 2);
	assert.match(game.error ?? "", /2\. Ke3/);
});

test("move words", () => {
	const w = (san: string, flags = "", o = plain) => moveWords(san, flags, o).text;
	assert.equal(w("e4"), "E4");
	assert.equal(moveWords("e4", "", { ...plain, pawns: "pawn-to" }).text, "Pawn to e4");
	assert.equal(w("Nxe5+"), "Knight takes e5, check");
	assert.equal(w("Nbd7"), "Knight b to d7");
	assert.equal(w("R1e2"), "Rook 1 to e2");
	assert.equal(w("Qh4xe1#"), "Queen h4 takes e1, checkmate");
	assert.equal(w("exd5"), "E takes d5");
	assert.equal(w("exd6", "e"), "E takes d6 en passant");
	assert.equal(w("e8=Q+"), "E8 promotes to queen, check");
	assert.equal(w("bxa1=N"), "B takes a1 promotes to knight");
	assert.equal(w("O-O"), "Castles kingside");
	assert.equal(w("O-O-O#"), "Castles queenside, checkmate");
});

test("speech form spells letters on request", () => {
	assert.equal(moveWords("Bb5", "", plain).speech, "Bishop to B 5");
	assert.equal(moveWords("Bb5", "", { ...plain, letters: "spelled", squareComma: true }).speech, "Bishop to bee, 5");
	assert.equal(moveWords("cxd4", "", { ...plain, letters: "nato" }).speech, "Charlie takes delta 4");
});

test("intro and dates", () => {
	assert.equal(spokenDate("2019.04.12"), "12 April 2019");
	assert.equal(spokenDate("2019.04.??"), "April 2019");
	assert.equal(spokenDate("2019.??.??"), "2019");
	assert.equal(spokenDate("????.??.??"), "");
	assert.equal(
		introText({ White: "Carlsen, Magnus", Black: "Nakamura,Hikaru", Event: "?", Date: "2019.??.??" }),
		"Magnus Carlsen versus Hikaru Nakamura, 2019.",
	);
});

const annotated = `[White "A"]
[Black "B"]
[Result "0-1"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4?! { Inaccuracy. Nc6 was best. } (3... Nc6 4. Bb5 (4. d5)) 4. Qd3?? { Blunder. } (4. dxe5 Bxf3 5. Qxf3) Nc6 0-1`;

test("script: main line only by default", () => {
	const cues = buildScript(replay(parsePgn(annotated)[0]), { ...DEFAULT_SCRIPT_SETTINGS, sayIntro: false });
	assert.deepEqual(cues.slice(0, 6).map((c) => c.text), ["Move 1", "White", "Pawn to e4", "Black", "Pawn to e5", "Move 2"]);
	assert.equal(cues.filter((c) => c.kind === "note").length, 0);
	assert.equal(cues.at(-1)?.text, "Black wins.");
	assert.equal(cues.at(-1)?.pauseAfterMs, 0);
	assert.equal(cues.find((c) => c.text === "Pawn to e4")?.pauseAfterMs, DEFAULT_SCRIPT_SETTINGS.pauseBetweenMovesMs);
});

test("script: annotation levels and alternative length", () => {
	const game = replay(parsePgn(annotated)[0]);
	const notes = (annotations: typeof DEFAULT_SCRIPT_SETTINGS.annotations, alternativeLength: number) =>
		buildScript(game, { ...DEFAULT_SCRIPT_SETTINGS, annotations, alternativeLength })
			.filter((c) => c.kind === "note")
			.map((c) => c.text);

	assert.deepEqual(notes("blunders", 1), ["A blunder. Better was D takes e5."]);
	assert.deepEqual(notes("inaccuracies", 2), [
		"An inaccuracy. Better was Knight to c6, then Bishop to b5.",
		"A blunder. Better was D takes e5, then Bishop takes f3.",
	]);
	assert.deepEqual(notes("mistakes", 0), ["A blunder."]);
});

test("script: black to move first gets a move number", () => {
	const [g] = parsePgn(`[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n\n1... e5 2. Nf3`);
	const cues = buildScript(replay(g), { ...DEFAULT_SCRIPT_SETTINGS, sayIntro: false });
	assert.deepEqual(cues.slice(0, 3).map((c) => c.text), ["Move 1", "Black", "Pawn to e5"]);
});
