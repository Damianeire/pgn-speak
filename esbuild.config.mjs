import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

// chess.js is bundled into app.js, so its licence notice has to travel with it.
// (The chess pieces' notice is a /*! comment in src/web/pieces.ts, which esbuild keeps.)
const chessLicence = readFileSync("node_modules/chess.js/LICENSE", "utf8").trim().replace(/\*\//g, "* /");

const serve = process.argv[2] === "serve";

const common = {
	bundle: true,
	target: "es2020",
	sourcemap: serve ? "inline" : false,
	minify: !serve,
	logLevel: "info",
};

const builds = [
	// The page itself: a classic script so index.html also works opened as a file.
	{
		...common,
		banner: { js: `/*\nPGN Speak includes chess.js (https://github.com/jhlywa/chess.js), under this licence:\n\n${chessLicence}\n*/` },
		entryPoints: ["src/web/main.ts"],
		format: "iife",
		outfile: "site/app.js",
	},
	// The high-quality voice, loaded only when someone picks it. Separate files keep
	// their own licences (see THIRD-PARTY-NOTICES.md) apart from the MIT app code.
	{
		...common,
		banner: { js: "/*! PGN Speak voice worker: kokoro-js, Transformers.js, ONNX Runtime Web and phonemizer (eSpeak NG). See THIRD-PARTY-NOTICES.md. */" },
		entryPoints: ["src/tts/worker.ts"],
		format: "esm",
		outfile: "site/tts-worker.js",
		// Node-only backends that Transformers.js never loads in a browser.
		external: ["onnxruntime-node", "sharp"],
	},
	{
		...common,
		banner: { js: "/*! MP3 encoding by lamejs (https://github.com/breezystack/lamejs), LGPL-3.0. See THIRD-PARTY-NOTICES.md. */" },
		entryPoints: ["src/tts/mp3-worker.ts"],
		format: "iife",
		outfile: "site/mp3-worker.js",
	},
];

if (serve) {
	const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
	await Promise.all(contexts.map((c) => c.watch()));
	const { port } = await contexts[0].serve({ servedir: "site", port: Number(process.env.PORT ?? 8123) });
	console.log(`Serving on http://localhost:${port}`);
} else {
	await Promise.all(builds.map((b) => esbuild.build(b)));
}
