// A plain, dependency-free board drawn from a FEN, for checking your
// visualisation after the fact.

const GLYPHS: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

export function renderBoard(el: HTMLElement, fen: string, flipped: boolean, lastMoveSquares: string[] = []) {
	const rows = fen.split(" ")[0].split("/");
	const squares: { name: string; piece: string }[] = [];
	rows.forEach((row, r) => {
		let file = 0;
		for (const ch of row) {
			if (/\d/.test(ch)) {
				for (let k = 0; k < Number(ch); k++) squares.push({ name: sq(file++, r), piece: "" });
			} else {
				squares.push({ name: sq(file++, r), piece: ch });
			}
		}
	});
	if (flipped) squares.reverse();

	el.replaceChildren(
		...squares.map(({ name, piece }) => {
			const cell = document.createElement("div");
			const fileIdx = name.charCodeAt(0) - 97;
			const rank = Number(name[1]);
			cell.className = `sq ${(fileIdx + rank) % 2 === 1 ? "light" : "dark"}`;
			if (lastMoveSquares.includes(name)) cell.classList.add("last");
			if (piece) {
				const p = document.createElement("span");
				p.className = `piece ${piece === piece.toUpperCase() ? "white" : "black"}`;
				// Use the solid glyph for both colours and colour it with CSS. U+FE0E asks for
				// the text form: Apple shows ♟ as an emoji otherwise, which ignores the colour.
				p.textContent = GLYPHS[piece.toLowerCase()] + "\uFE0E";
				cell.append(p);
			}
			cell.setAttribute("aria-label", piece ? `${name} ${pieceName(piece)}` : name);
			return cell;
		}),
	);
}

function sq(file: number, row: number): string {
	return String.fromCharCode(97 + file) + (8 - row);
}

function pieceName(p: string): string {
	const colour = p === p.toUpperCase() ? "white" : "black";
	const names: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
	return `${colour} ${names[p.toLowerCase()]}`;
}
