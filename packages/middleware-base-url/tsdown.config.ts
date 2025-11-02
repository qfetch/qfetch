import { defineConfig } from "tsdown";

export default defineConfig([
	{
		globalName: "QFM_baseUrl",
		platform: "neutral",
		target: "es2020",
		format: ["cjs", "esm", "iife"],
		sourcemap: true,
		minify: true,
	},
]);
