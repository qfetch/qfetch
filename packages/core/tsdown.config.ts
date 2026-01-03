import { defineConfig } from "tsdown";

export default defineConfig([
	{
		globalName: "QFC",
		platform: "neutral",
		target: "es2020",
		format: ["cjs", "esm", "iife"],
		sourcemap: true,
		minify: true,
	},
]);
