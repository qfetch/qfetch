import { describe, suite, type TestContext, test } from "node:test";

import { type BaseUrlOptions, withBaseUrl } from "./with-base-url.ts";

/* node:coverage disable */

suite("withBaseUrl - unit middleware", () => {
	describe("configuration validation ensures base URL correctness", () => {
		test("throws error when base URL is invalid", (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const opts: BaseUrlOptions = "not-a-valid-url";

			// Assert
			ctx.assert.throws(
				() => withBaseUrl(opts),
				"throws error for invalid base URL",
			);
		});

		test("accepts valid base URL without errors", (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const opts: BaseUrlOptions = "http://api.local";

			// Assert
			ctx.assert.doesNotThrow(
				() => withBaseUrl(opts),
				"does not throw error for valid base URL",
			);
		});

		test("accepts URL object as base URL", (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const opts: BaseUrlOptions = new URL("http://api.local/v1/");

			// Assert
			ctx.assert.doesNotThrow(
				() => withBaseUrl(opts),
				"does not throw error for URL object as base",
			);
		});
	});

	describe("string inputs follow standard URL resolution", () => {
		test("resolves relative paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/v1/users",
					"relative path is resolved against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("users");
		});

		test("resolves absolute paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/users",
					"absolute path replaces base path per URL standard",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("/users");
		});

		test("ignores base URL for absolute URLs with different origin", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://example.com/data",
					"absolute URL ignores base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("http://example.com/data");
		});

		test("ignores base URL for absolute URLs with same origin", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/data",
					"absolute URL ignores base URL regardless of origin",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("http://api.local/data");
		});

		test("preserves query parameters when resolving relative string paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/v1/users?page=1",
					"query parameters are preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("users?page=1");
		});

		test("preserves hash when resolving relative string paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/v1/users#section",
					"hash is preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("users#section");
		});

		test("preserves query parameters with absolute string paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/users?page=1",
					"query parameters are preserved with absolute path",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("/users?page=1");
		});

		test("preserves hash with absolute string paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/users#section",
					"hash is preserved with absolute path",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("/users#section");
		});

		test("resolves root path string against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/",
					"root path replaces base path",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("/");
		});

		test("resolves empty string against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/v1/",
					"empty string resolves to base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("");
		});
	});

	describe("URL inputs are passed through unchanged", () => {
		test("passes URL objects through unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const inputUrl = new URL("http://example.com/data");
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.strictEqual(input, inputUrl, "same URL object reference");

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(inputUrl);
		});
	});

	describe("Request inputs are passed through unchanged", () => {
		test("passes Request objects through unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const inputRequest = new Request("http://example.com/data", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "John" }),
			});
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.strictEqual(input, inputRequest, "same Request object reference");

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(inputRequest);
		});
	});
});
