import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withBaseUrl} middleware.
 *
 * Accepts a base URL as either a string or URL instance.
 *
 * @remarks
 * The middleware only applies base URL resolution to **string inputs**, conforming to the URL constructor standard behavior:
 *
 * **String inputs (resolved using `new URL(input, base)`):**
 * - **Relative URLs** (e.g., `"users"`) → resolved against the base URL
 * - **Absolute paths** (e.g., `"/users"`) → replaces the base URL's pathname (keeps protocol + host from base)
 * - **Absolute URLs with scheme** (e.g., `"https://example.com/data"`) → ignores the base URL entirely
 *
 * **URL and Request objects:**
 * - Passed through unchanged, as they already contain absolute URLs
 *
 * **Trailing slash matters:** Using `"https://api.example.com/v1/"` (with trailing slash)
 * appends paths as expected, while `"https://api.example.com/v1"` (without trailing slash)
 * replaces the last path segment following standard URL resolution behavior.
 *
 * @see {@link https://url.spec.whatwg.org/ WHATWG URL Standard}
 */
export type BaseUrlOptions = string | URL;

/**
 * Middleware that resolves string fetch requests against a configured base URL following standard URL constructor behavior.
 *
 * Automatically resolves string request URLs against a configured base URL using the WHATWG URL Standard:
 *
 * **String inputs (resolved using `new URL(input, base)`):**
 * - **Relative URLs** (like `"users"`) → resolved against the base URL
 * - **Absolute paths** (like `"/users"`) → replaces the base URL's pathname (keeps protocol + host from base)
 * - **Absolute URLs with scheme** (like `"https://api.example.com/data"`) → ignores the base URL entirely
 *
 * **URL objects and Request objects:**
 * - Passed through unchanged, as they already contain absolute URLs
 *
 * The middleware preserves input types throughout the chain: string inputs remain strings,
 * URL objects remain URLs, and Request objects remain Requests.
 *
 * @param opts - Configuration parameters. See {@link BaseUrlOptions} for details.
 *
 * @throws {TypeError} When the provided base URL is invalid or cannot be parsed.
 *
 * @example
 * ```ts
 * import { withBaseUrl } from "@qfetch/middleware-base-url";
 *
 * const qfetch = withBaseUrl("https://api.example.com/v1/")(fetch);
 *
 * // Case 1: Relative URLs - resolved against the base
 * await qfetch("users");  // → https://api.example.com/v1/users
 *
 * // Case 2: Absolute paths - replaces pathname (keeps protocol + host from base)
 * await qfetch("/users"); // → https://api.example.com/users
 *
 * // Case 3: Absolute URLs with scheme - base is ignored entirely
 * await qfetch("https://external.com/data"); // → https://external.com/data
 *
 * // URL and Request objects are passed through unchanged
 * await qfetch(new URL("https://external.com/data")); // → https://external.com/data
 * await qfetch(new Request("https://external.com/webhook")); // → https://external.com/webhook
 * ```
 *
 * @see {@link https://url.spec.whatwg.org/ WHATWG URL Standard}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URL MDN: URL API}
 */
export const withBaseUrl: Middleware<BaseUrlOptions> = (opts) => {
	const base = new URL(opts);

	return (next) => async (input, init) => {
		// Only apply base URL resolution to string inputs, conforming to URL constructor standard behavior.
		// Per WHATWG URL Standard (new URL(input, base)):
		// - Relative URLs (e.g., "users") → resolved against base
		// - Absolute paths (e.g., "/users") → replaces base pathname (keeps protocol + host)
		// - Absolute URLs with scheme (e.g., "https://...") → ignores base entirely
		// - URL and Request objects already contain absolute URLs, so pass them through unchanged
		//
		// Preserve the input type (string → string, URL → URL, Request → Request)
		// to maintain type consistency throughout the middleware chain.
		if (typeof input === "string") {
			// Standard URL resolution using URL constructor with base parameter
			input = new URL(input, base).toString();
		}
		// URL and Request objects are passed through unchanged

		return next(input, init);
	};
};
