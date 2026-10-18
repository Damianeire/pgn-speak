# PGN Speak

Hear a chess game read aloud, move by move, for blindfold practice. Started as a
Keyboard Maestro macro; now a static web page that runs entirely in the browser
(speech comes from the device's own voices, nothing is uploaded).

## Use

- Paste a PGN, open or drop a `.pgn` file, or paste a Lichess game link.
- Space plays or pauses, ← / → change move, R repeats the move.
- Settings (saved in the browser): pauses, speed, voice, "wait for me" step mode,
  pawn and letter wording, whether to point out blunders / mistakes / inaccuracies
  and read 0–3 moves of the better line, and an optional board and move list.

## Develop

```bash
npm install
npm run dev     # http://localhost:8123, rebuilds on save
npm test        # core tests (node --test)
npm run build   # type-check and write site/app.js
```

`site/` is the whole deployable site (GitHub Pages, Cloudflare Pages, Netlify…).

## Layout

- `src/core/` — no DOM, shared with a future Obsidian plugin
  - `pgn.ts` reads PGN (tags, comments, NAGs, nested variations, several games)
  - `game.ts` replays it with chess.js (legality, positions, better lines)
  - `speech.ts` turns one SAN move into words
  - `script.ts` builds the list of spoken cues and their pauses
- `src/web/` — the page: player (Web Speech API), board, settings, wiring
