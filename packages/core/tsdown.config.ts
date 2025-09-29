import { defineConfig } from "tsdown";

export default defineConfig([
	{
		globalName: "QFetch",
		platform: "neutral",
		target: "es2020",
		format: ["cjs", "esm", "iife"],
		sourcemap: true,
	},
]);
