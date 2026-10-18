# PGN Speak

Hear a chess game read aloud, move by move, for blindfold practice. Started as a
Keyboard Maestro macro; now a static web page that runs entirely in the browser.
Speech comes from the device's own voices or from the Kokoro voice model running
in the page, and nothing is uploaded.

## Use

- Paste a PGN, open or drop a `.pgn` file, or paste a Lichess game link.
- Space plays or pauses, ← / → change move, R repeats the move.
- Settings (saved in the browser): pauses, speed, voice, "wait for me" step mode,
  pawn and letter wording, whether to point out blunders / mistakes / inaccuracies
  and read 0–3 moves of the better line, and an optional board and move list.
- **High-quality voice:** the Kokoro-82M model (about 90 MB, downloaded once from
  Hugging Face and cached by the browser) runs on the CPU in a Web Worker. It is
  slower than device voices, roughly as long to make as to say on a recent Mac.
- **Download MP3:** renders the whole game with the high-quality voice and your
  pauses, then encodes it in the browser.
- The high-quality voice and MP3 need the page served over http(s); opened as a
  local file, the page falls back to device voices.

## Develop

```bash
npm install
npm run dev     # http://localhost:8123, rebuilds on save
npm test        # core tests (node --test)
npm run build   # type-check and write site/app.js, tts-worker.js, mp3-worker.js
```

`site/` is the whole deployable site (GitHub Pages, Cloudflare Pages, Netlify…).

## Layout

- `src/core/` — no DOM, shared with the Obsidian plugin (obsidian-pgn-speak copies it with `npm run sync-core`)
  - `pgn.ts` reads PGN (tags, comments, NAGs, nested variations, several games)
  - `game.ts` replays it with chess.js (legality, positions, better lines)
  - `speech.ts` turns one SAN move into words
  - `script.ts` builds the list of spoken cues and their pauses
- `src/tts/` — the high-quality voice (`worker.ts`, `kokoro.ts`) and the MP3 encoder worker
- `src/web/` — the page: player and speakers (device voices or Kokoro), MP3 export, board, settings, wiring

## Credits

Moves are checked with [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause). The board uses Cburnett's chess pieces from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces), under their BSD-3-Clause option. The full notices are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and the built `site/app.js` carries them too.

The high-quality voice uses [kokoro-js](https://github.com/hexgrad/kokoro) and the Kokoro-82M model (Apache-2.0), with Transformers.js, ONNX Runtime Web and eSpeak NG (GPL-3.0) for pronunciation; MP3s are encoded with [lamejs](https://github.com/breezystack/lamejs) (LGPL-3.0). Both live in their own files, separate from the MIT app code; see the notices file.
