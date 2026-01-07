import { defineConfig } from "tsdown";

export default defineConfig([
	{
		platform: "neutral",
		target: "es2020",
		format: ["cjs", "esm"],
		sourcemap: true,
		minify: true,
	},
	{
		globalName: "QFM_logging",
		platform: "neutral",
		target: "es2020",
		format: ["iife"],
		sourcemap: true,
		minify: true,
	},
]);
