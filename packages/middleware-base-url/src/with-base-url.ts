import type { Middleware } from "@qfetch/core";

/**
 * Base URL for resolving relative request paths (string or URL instance).
 *
 * @remarks
 * Trailing slash recommended: `"https://api.example.com/v1/"` appends paths,
 * while `"https://api.example.com/v1"` replaces the last segment.
 *
 * @see https://url.spec.whatwg.org/
 */
export type BaseUrlOptions = string | URL;

/**
 * Resolves fetch requests against a base URL with consistent same-origin handling.
 *
 * **Same-origin requests:** All paths (even those starting with `/`) are treated
 * as relative and resolved against the base path. This ensures consistent behavior
 * across string, URL, and Request inputs.
 *
 * **Different-origin requests:** Passed through unchanged (cross-origin requests
 * remain intact).
 *
 * Preserves input types (string→string, URL→URL, Request→Request).
 *
 * @example
 * ```ts
 * const qfetch = withBaseUrl("https://api.example.com/v1/")(fetch);
 *
 * // Same-origin inputs - all resolve against base path
 * await qfetch("users");                      // → "https://api.example.com/v1/users"
 * await qfetch("/users");                     // → "https://api.example.com/v1/users"
 * await qfetch(new URL("/users", "https://api.example.com"));
 * // → "https://api.example.com/v1/users"
 *
 * // Different-origin inputs - unchanged
 * await qfetch("https://other.com/data");     // → "https://other.com/data"
 * await qfetch(new URL("https://other.com/data"));
 * // → "https://other.com/data"
 * ```
 *
 * @param opts - Base URL (string or URL instance)
 * @throws {TypeError} When base URL is invalid
 * @see https://url.spec.whatwg.org/
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
