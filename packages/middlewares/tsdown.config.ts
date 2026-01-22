import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	target: "es2020",
	dts: true,
	sourcemap: true,
	clean: true,
});
