import type { Middleware } from "@qfetch/core";

/**
 * Middleware that resolves string fetch requests against a base URL.
 *
 * Resolves string request URLs against the provided base URL using the WHATWG URL Standard
 * (`new URL(input, base)`). URL and Request objects are passed through unchanged.
 *
 * @remarks
 * **Resolution behavior for string inputs:**
 * - **Relative URLs** (`"users"`) → resolved against the base URL
 * - **Absolute paths** (`"/users"`) → replaces the base pathname (keeps protocol + host)
 * - **Absolute URLs** (`"https://other.com"`) → base URL is ignored entirely
 *
 * **Trailing slash matters:** `"https://api.example.com/v1/"` (with slash) appends paths,
 * while `"https://api.example.com/v1"` (without slash) replaces the last segment.
 *
 * **Input type preservation:**
 * String inputs remain strings, URL objects remain URLs, and Request objects remain Requests.
 *
 * @param baseUrl - The base URL to resolve against (string or URL instance).
 *
 * @throws {TypeError} When the base URL is invalid or a string input cannot be resolved.
 *
 * @example
 * ```ts
 * import { withBaseUrl } from "@qfetch/middleware-base-url";
 *
 * const qfetch = withBaseUrl("https://api.example.com/v1/")(fetch);
 *
 * await qfetch("users");           // → https://api.example.com/v1/users
 * await qfetch("/users");          // → https://api.example.com/users
 * await qfetch("https://x.com");   // → https://x.com (base ignored)
 * ```
 *
 * @see {@link https://url.spec.whatwg.org/ WHATWG URL Standard}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URL MDN: URL API}
 */
export const withBaseUrl: Middleware<[baseUrl: string | URL]> = (baseUrl) => {
	const base = new URL(baseUrl);

	return (next) => async (input, init) => {
		// Only apply base URL resolution to string inputs.
		// URL and Request objects already contain absolute URLs, so pass them through unchanged.
		if (typeof input === "string") {
			input = new URL(input, base).toString();
		}

		return next(input, init);
	};
};
