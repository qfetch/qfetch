import { describe, suite, type TestContext, test } from "node:test";

import { type BaseUrlOptions, withBaseUrl } from "./with-base-url.ts";

/* node:coverage disable */

suite("withBaseUrl - middleware", () => {
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

	describe("string inputs are correctly resolved against base URL", () => {
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

		test("resolves same-origin absolute paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/v1/users",
					"same-origin absolute path resolves against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("/users");
		});

		test("passes through different-origin URLs unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://example.com/data",
					"different-origin URL remains unchanged",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("http://example.com/data");
		});

		test("passes through same-origin absolute URLs unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"http://api.local/data",
					"same-origin absolute URL remains unchanged",
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

		test("preserves query parameters when resolving absolute string paths", async (ctx: TestContext) => {
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

		test("preserves hash when resolving absolute string paths", async (ctx: TestContext) => {
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
					"http://api.local/v1/",
					"root path resolves to base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch("/");
		});
	});

	describe("URL inputs are correctly resolved against base URL", () => {
		test("resolves same-origin URL with relative pathname against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users",
					"same-origin URL with relative pathname is resolved against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			// Create a URL object and test edge case where pathname might not start with "/"
			// While http/https URLs always have "/" prefix, test the defensive code path
			const url = new URL("http://api.local");
			// Manually construct a URL-like scenario by resolving "users" which gives "/users"
			const testUrl = new URL("users", url);
			await qfetch(testUrl);
		});

		test("resolves same-origin URL paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users",
					"same-origin URL path is resolved against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(new URL("users", "http://api.local"));
		});

		test("resolves same-origin URL with absolute path against base", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users",
					"same-origin URL with absolute path resolves against base",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(new URL("/users", "http://api.local"));
		});

		test("passes through different-origin URLs unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://example.com/data",
					"different-origin URL remains unchanged",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(new URL("http://example.com/data"));
		});

		test("preserves query parameters when resolving same-origin URLs", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users?page=1",
					"query parameters are preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(new URL("/users?page=1", "http://api.local"));
		});

		test("preserves hash when resolving same-origin URLs", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users#section",
					"hash is preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(new URL("/users#section", "http://api.local"));
		});

		test("resolves same-origin URL with empty pathname against base", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/",
					"empty pathname resolves to base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(new URL("http://api.local"));
		});

		test("preserves query and hash when resolving same-origin URLs", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users?page=1#section",
					"query and hash are both preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			await qfetch(new URL("/users?page=1#section", "http://api.local"));
		});

		test("handles URL with pathname not starting with slash", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.toString(),
					"http://api.local/v1/users",
					"pathname without leading slash is handled correctly",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			// Create a Proxy that simulates a URL with pathname not starting with "/"
			const baseUrl = new URL("http://api.local/users");
			const proxiedUrl = new Proxy(baseUrl, {
				get(target, prop) {
					if (prop === "pathname") {
						return "users"; // Return pathname without leading slash
					}
					return target[prop as keyof URL];
				},
			}) as URL;

			await qfetch(proxiedUrl);
		});
	});

	describe("Request inputs are correctly resolved against base URL", () => {
		test("resolves same-origin Request paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users",
					"same-origin Request path is resolved against base URL",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			const request = new Request(new URL("users", "http://api.local"));
			await qfetch(request);
		});

		test("resolves same-origin Request with absolute path against base", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users",
					"same-origin Request with absolute path resolves against base",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			const request = new Request(new URL("/users", "http://api.local"));
			await qfetch(request);
		});

		test("passes through different-origin Requests unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					input.url,
					"http://example.com/data",
					"different-origin Request remains unchanged",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			const request = new Request("http://example.com/data");
			await qfetch(request);
		});

		test("preserves query parameters when resolving same-origin Requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users?page=1",
					"query parameters are preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			const request = new Request(new URL("/users?page=1", "http://api.local"));
			await qfetch(request);
		});

		test("preserves hash when resolving same-origin Requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					input.url,
					"http://api.local/v1/users#section",
					"hash is preserved",
				);

				return new Response();
			});

			const qfetch = withBaseUrl("http://api.local/v1/")(fetchMock);

			// Act
			const request = new Request(
				new URL("/users#section", "http://api.local"),
			);
			await qfetch(request);
		});
	});
});
