import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withBaseUrl} middleware.
 *
 * Represents the base URL that all relative request paths will be resolved against.
 * This can be provided as either a string or a pre-constructed `URL` object.
 *
 * @example
 * ```ts
 * // As a string
 * const base: BaseUrlOptions = "https://api.example.com/v1/";
 *
 * // As a URL instance
 * const base: BaseUrlOptions = new URL("https://api.example.com/v1/");
 * ```
 *
 * @note A trailing slash (`/`) at the end of the base URL is required.
 * Without it, the `URL` constructor treats the final path segment as a file name
 * and replaces it when resolving relative paths, e.g.:
 * ```ts
 * new URL("users", "https://api.example.com/v1"); // → "https://api.example.com/users"
 * new URL("users", "https://api.example.com/v1/"); // → "https://api.example.com/v1/users"
 * ```
 */
export type BaseUrlOptions = string | URL;

/**
 * Middleware that automatically applies a base URL to relative fetch requests.
 *
 * This utility wraps a fetch-like function and ensures that any relative
 * request URLs are resolved against the configured base URL, mirroring the
 * behavior of the native `URL` constructor.
 *
 * **Behavior**
 * - Relative paths (e.g. `"users"`) are resolved relative to the base URL.
 * - Absolute paths (e.g. `"/users"`) are resolved to the base URL’s origin root.
 * - Fully qualified URLs (e.g. `"https://example.com/data"`) are left unchanged.
 * - `Request` objects are passed through unmodified, since their `.url` is
 *   always fully qualified and cannot be safely rebased without breaking the
 *   semantics of the Fetch API.
 *
 * @example
 * ```ts
 * import { withBaseUrl } from "@qfetch/middleware-base-url";
 *
 * const qfetch = withBaseUrl("https://api.example.com/v1/")(fetch);
 *
 * // Resolves to "https://api.example.com/v1/users"
 * await qfetch("users");
 * ```
 *
 * @param opts - The base URL to resolve relative requests against.
 * @returns A middleware function compatible with `@qfetch/core`.
 */
export const withBaseUrl: Middleware<BaseUrlOptions> = (opts) => {
	const base = new URL(opts);

	return (next) => async (input, init) => {
		// NOTE: keep the same input type in the chain
		if (typeof input === "string") input = new URL(input, base).toString();
		else if (input instanceof URL) input = new URL(input, base);
		// NOTE: Pass through Request objects without modifying their URL.
		// Reason: Request.url is always fully resolved (absolute) by the runtime.
		// Once constructed, the original relative input is lost, so rebasing would
		// be inaccurate and could break the semantics of the Fetch API—potentially
		// redirecting requests to unintended hosts. Base URL logic should only apply
		// to string or URL inputs, not Request objects.

		return next(input, init);
	};
};
