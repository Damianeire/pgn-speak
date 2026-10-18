// A plain, dependency-free board drawn from a FEN, for checking your
// visualisation after the fact.

import { PIECES } from "./pieces.ts";

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
				// An image rather than a font glyph, so pieces look the same everywhere.
				const img = document.createElement("img");
				img.className = "piece";
				img.alt = "";
				img.src = "data:image/svg+xml," + encodeURIComponent(PIECES[piece]);
				cell.append(img);
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
