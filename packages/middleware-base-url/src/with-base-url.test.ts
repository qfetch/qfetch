import { describe, it, type TestContext } from "node:test";

import { type BaseUrlOptions, withBaseUrl } from "./with-base-url.ts";

/* node:coverage disable */
describe("withBaseUrl middleware", () => {
	describe("Configuration validation", () => {
		it("should throw error when base URL is invalid", (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const opts: BaseUrlOptions = "not-a-valid-url";

			// assert
			ctx.assert.throws(
				() => withBaseUrl(opts),
				"Should throw error for invalid base URL",
			);
		});

		it("should accept valid base URL without errors", (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const opts: BaseUrlOptions = "http://api.local";

			// assert
			ctx.assert.doesNotThrow(
				() => withBaseUrl(opts),
				"Should not throw error for valid base URL",
			);
		});
	});

	describe("Requests with string input", () => {
		it("should resolve relative paths against base URL", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "Input should be a string");
				ctx.assert.equal(
					input,
					"http://api.local/v1/users",
					"Relative path should be resolved against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch("users");
		});

		it("should resolve same-origin absolute paths against base URL", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "Input should be a string");
				ctx.assert.equal(
					input,
					"http://api.local/v1/users",
					"Same-origin absolute path should resolve against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch("/users");
		});

		it("should pass through different-origin URLs unchanged", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "Input should be a string");
				ctx.assert.equal(
					input,
					"http://example.com/data",
					"Different-origin URL should remain unchanged",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch("http://example.com/data");
		});
	});

	describe("Requests with URL input", () => {
		it("should resolve same-origin URL paths against base URL", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "Input should be a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users",
					"Same-origin URL path should be resolved against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch(new URL("users", "http://api.local"));
		});

		it("should resolve same-origin URL with absolute path against base", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "Input should be a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users",
					"Same-origin URL with absolute path should resolve against base",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch(new URL("/users", "http://api.local"));
		});

		it("should pass through different-origin URLs unchanged", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "Input should be a URL");
				ctx.assert.equal(
					input.toString(),
					"http://example.com/data",
					"Different-origin URL should remain unchanged",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch(new URL("http://example.com/data"));
		});

		it("should preserve query parameters when resolving same-origin URLs", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "Input should be a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users?page=1",
					"Query parameters should be preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch(new URL("/users?page=1", "http://api.local"));
		});

		it("should preserve hash when resolving same-origin URLs", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "Input should be a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users#section",
					"Hash should be preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			await qfetch(new URL("/users#section", "http://api.local"));
		});
	});

	describe("Requests with Request input", () => {
		it("should resolve same-origin Request paths against base URL", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "Input should be a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users",
					"Same-origin Request path should be resolved against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			const request = new Request(new URL("users", "http://api.local"));
			await qfetch(request);
		});

		it("should resolve same-origin Request with absolute path against base", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "Input should be a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users",
					"Same-origin Request with absolute path should resolve against base",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			const request = new Request(new URL("/users", "http://api.local"));
			await qfetch(request);
		});

		it("should pass through different-origin Requests unchanged", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "Input should be a Request");
				ctx.assert.equal(
					input.url,
					"http://example.com/data",
					"Different-origin Request should remain unchanged",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			const request = new Request("http://example.com/data");
			await qfetch(request);
		});

		it("should preserve query parameters when resolving same-origin Requests", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "Input should be a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users?page=1",
					"Query parameters should be preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			const request = new Request(new URL("/users?page=1", "http://api.local"));
			await qfetch(request);
		});

		it("should preserve hash when resolving same-origin Requests", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "Input should be a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users#section",
					"Hash should be preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// act
			const request = new Request(
				new URL("/users#section", "http://api.local"),
			);
			await qfetch(request);
		});
	});
});
