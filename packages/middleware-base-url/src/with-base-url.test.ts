import { describe, it, type TestContext } from "node:test";

import { type BaseUrlOptions, withBaseUrl } from "./with-base-url.ts";

describe("withBaseUrl middleware", () => {
	describe("Base URL validation", () => {
		it("should fail when provided base URL is invalid", (ctx: TestContext) => {
			const opts: BaseUrlOptions = "not-a-valid-url";

			ctx.assert.throws(() => withBaseUrl(opts));
		});

		it("should succeed when provided base URL is valid", (ctx: TestContext) => {
			const opts: BaseUrlOptions = "http://api.local";

			ctx.assert.doesNotThrow(() => withBaseUrl(opts));
		});
	});

	describe("Request URL resolution for relative and absolute paths", () => {
		it("should change request made with a relative path", async (ctx: TestContext) => {
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				const fetchedUrl =
					input instanceof URL || typeof input === "string"
						? input.toString()
						: input.url;

				ctx.assert.equal(fetchedUrl, "http://api.local/v1/users");

				return new Response();
			});

			const opts: BaseUrlOptions = "http://api.local/v1/";
			const qfetch = withBaseUrl(opts)(fetchMock);

			const request = "users";
			await qfetch(request);
		});

		it("should change request made with an absolute path", async (ctx: TestContext) => {
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				const fetchedUrl =
					input instanceof URL || typeof input === "string"
						? input.toString()
						: input.url;

				ctx.assert.equal(fetchedUrl, "http://api.local/users");

				return new Response();
			});

			const opts: BaseUrlOptions = "http://api.local/v1/";
			const qfetch = withBaseUrl(opts)(fetchMock);

			const request = "/users";
			await qfetch(request);
		});

		it("should passthrough request made with a fully qualified URL", async (ctx: TestContext) => {
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				const fetchedUrl =
					input instanceof URL || typeof input === "string"
						? input.toString()
						: input.url;

				ctx.assert.equal(fetchedUrl, "http://example.com/data");

				return new Response();
			});

			const opts: BaseUrlOptions = "http://api.local/v1/";
			const qfetch = withBaseUrl(opts)(fetchMock);

			const request = "http://example.com/data";
			await qfetch(request);

			const requestObject = new Request("http://example.com/data");
			await qfetch(requestObject);
		});
	});
});
