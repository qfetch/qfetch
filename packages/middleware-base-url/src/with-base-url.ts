import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withBaseUrl} middleware.
 *
 * Accepts a base URL as either a string or URL instance.
 *
 * @remarks
 * **Trailing slash recommended:** Using `"https://api.example.com/v1/"` (with trailing slash)
 * appends paths as expected, while `"https://api.example.com/v1"` (without trailing slash)
 * replaces the last path segment following standard URL resolution behavior.
 *
 * @see {@link https://url.spec.whatwg.org/ WHATWG URL Standard}
 */
export type BaseUrlOptions = string | URL;

/**
 * Middleware that resolves fetch requests against a configured base URL with consistent same-origin handling.
 *
 * Automatically resolves request URLs against a configured base URL. All same-origin requests
 * (even those with absolute paths like `/users`) are treated as relative to the base path,
 * while different-origin requests pass through unchanged. This utility-first approach provides
 * more intuitive and consistent behavior than strict WHATWG URL Standard resolution.
 *
 * The middleware preserves input types throughout the chain: string inputs remain strings,
 * URL objects remain URLs, and Request objects remain Requests (reconstructed with new URLs).
 *
 * @param opts - Configuration parameters. See {@link BaseUrlOptions} for details.
 *
 * @throws {TypeError} When the provided base URL is invalid or cannot be parsed.
 *
 * @example Basic usage with string inputs
 * ```ts
 * import { withBaseUrl } from "@qfetch/middleware-base-url";
 *
 * const qfetch = withBaseUrl("https://api.example.com/v1/")(fetch);
 *
 * // Same-origin paths - all resolve against the base
 * await qfetch("users");  // → https://api.example.com/v1/users
 * await qfetch("/users"); // → https://api.example.com/v1/users (leading slash stripped)
 *
 * // Different-origin URL - left unchanged
 * await qfetch("https://external.com/data"); // → https://external.com/data
 * ```
 *
 * @example Using with URL objects
 * ```ts
 * import { withBaseUrl } from "@qfetch/middleware-base-url";
 *
 * const qfetch = withBaseUrl("https://api.example.com/v1/")(fetch);
 *
 * // Same origin - path resolved against base
 * const sameOriginUrl = new URL("/users", "https://api.example.com");
 * await qfetch(sameOriginUrl); // → https://api.example.com/v1/users
 *
 * // Different origin - passed through unchanged
 * const differentOriginUrl = new URL("https://external.com/data");
 * await qfetch(differentOriginUrl); // → https://external.com/data
 * ```
 *
 * @example Using with Request objects
 * ```ts
 * import { withBaseUrl } from "@qfetch/middleware-base-url";
 *
 * const qfetch = withBaseUrl("https://api.example.com/v1/")(fetch);
 *
 * // Same-origin Request - path resolved against base
 * const sameOriginRequest = new Request(
 *   new URL("/users", "https://api.example.com"),
 *   { method: "POST", body: JSON.stringify({ name: "John" }) }
 * );
 * await qfetch(sameOriginRequest); // → https://api.example.com/v1/users
 * // All other properties (method, headers, body) are preserved
 * ```
 *
 * @see {@link https://url.spec.whatwg.org/ WHATWG URL Standard}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URL MDN: URL API}
 */
export const withBaseUrl: Middleware<BaseUrlOptions> = (opts) => {
	const base = new URL(opts);

	return (next) => async (input, init) => {
		// Apply base URL resolution to string, URL, and Request inputs.
		// Preserve the input type (string → string, URL → URL, Request → Request)
		// to maintain type consistency throughout the middleware chain.
		if (typeof input === "string") {
			// Try to parse as absolute URL first
			let url: URL;
			try {
				url = new URL(input);
			} catch {
				// Not absolute, resolve against base
				url = new URL(input, base);
			}

			// Same-origin strings: treat pathname as relative, resolve against base path
			// Different-origin strings: pass through unchanged (cross-origin request)
			if (url.origin === base.origin) {
				// Strip leading slash to force relative resolution
				const relativePath =
					url.pathname === input ? url.pathname.substring(1) : url.pathname;
				input = new URL(relativePath + url.search + url.hash, base).toString();
			} else {
				// Different origin, use as-is
				input = url.toString();
			}
		} else if (input instanceof URL) {
			// Same-origin URLs: treat pathname as relative, resolve against base path
			// Different-origin URLs: pass through unchanged (cross-origin request)
			if (input.origin === base.origin) {
				// Strip leading slash to force relative resolution
				const relativePath = input.pathname.startsWith("/")
					? input.pathname.substring(1)
					: input.pathname;
				input = new URL(relativePath + input.search + input.hash, base);
			}
			// else: different origin, pass through unchanged
		} else if (input instanceof Request) {
			const requestUrl = new URL(input.url);
			// Same-origin Requests: treat pathname as relative, resolve against base path
			// Different-origin Requests: pass through unchanged (cross-origin request)
			if (requestUrl.origin === base.origin) {
				const resolvedUrl = new URL(
					requestUrl.pathname.substring(1) +
						requestUrl.search +
						requestUrl.hash,
					base,
				);
				input = new Request(resolvedUrl, input);
			}
			// else: different origin, pass through unchanged
		}

		return next(input, init);
	};
};
