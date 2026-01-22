import { defineConfig } from "tsdown";

export default defineConfig([
	{
		globalName: "QFM_queryParams",
		platform: "neutral",
		target: "es2020",
		format: ["cjs", "esm", "iife"],
		sourcemap: true,
		minify: true,
	},
]);
