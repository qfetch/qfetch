import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
	plop.setGenerator("Middleware", {
		description: "A qfetch middleware",
		prompts: [
			{
				type: "input",
				name: "middlewareName",
				message: "What is the middleware name (without `with` prefix)?",
			},
		],
		actions: [
			{
				type: "addMany",
				destination: "packages/middleware-{{kebabCase middlewareName}}",
				base: "../templates/middleware",
				templateFiles: [
					"../templates/middleware/*",
					"../templates/middleware/**/*",
				],
			},
		],
	});
}
