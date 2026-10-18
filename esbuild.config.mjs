import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

// chess.js is bundled into app.js, so its licence notice has to travel with it.
// (The chess pieces' notice is a /*! comment in src/web/pieces.ts, which esbuild keeps.)
const chessLicence = readFileSync("node_modules/chess.js/LICENSE", "utf8").trim().replace(/\*\//g, "* /");

const serve = process.argv[2] === "serve";

const options = {
	banner: { js: `/*\nPGN Speak includes chess.js (https://github.com/jhlywa/chess.js), under this licence:\n\n${chessLicence}\n*/` },
	entryPoints: ["src/web/main.ts"],
	bundle: true,
	format: "iife",
	target: "es2020",
	outfile: "site/app.js",
	sourcemap: serve ? "inline" : false,
	minify: !serve,
	logLevel: "info",
};

if (serve) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
	const { port } = await ctx.serve({ servedir: "site", port: Number(process.env.PORT ?? 8123) });
	console.log(`Serving on http://localhost:${port}`);
} else {
	await esbuild.build(options);
}
