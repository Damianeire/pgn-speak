import * as esbuild from "esbuild";

const serve = process.argv[2] === "serve";

const options = {
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
