import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withRetryAfter} middleware.
 *
 * @example
 * ```ts
 * { maxRetries: 3, maxDelayTime: 120_000, maxJitter: 5_000 }
 * ```
 */
export type RetryAfterOptions = {
	/**
	 * Maximum number of retry attempts. Default: unlimited.
	 * - `0` = no retries
	 * - `>= 1` = limit retry attempts
	 * - Negative/NaN/undefined = unlimited
	 */
	maxRetries?: number;

	/**
	 * Maximum delay in milliseconds for a single retry. Default: unlimited.
	 * Throws `AbortError` if `Retry-After` exceeds this value.
	 * - `0` = only instant retries
	 * - `>= 1` = ceiling on delay
	 * - Negative/NaN/undefined = unlimited
	 */
	maxDelayTime?: number;

	/**
	 * Maximum random jitter in milliseconds using full-jitter strategy. Default: no jitter.
	 * Prevents thundering herd by adding randomness to retry timing.
	 *
	 * Full-jitter formula: `retryAfterDelay + random(0, min(maxJitter, retryAfterDelay))`
	 *
	 * This ensures jitter scales with the base delay while respecting the cap.
	 * - `0` = no jitter
	 * - `>= 1` = jitter capped at this value
	 * - Negative/NaN/undefined = no jitter
	 *
	 * @example
	 * ```ts
	 * // Retry-After: 10s, maxJitter: 5000
	 * // Actual delay: 10s + random(0, 5s) = 10-15s
	 *
	 * // Retry-After: 2s, maxJitter: 5000
	 * // Actual delay: 2s + random(0, 2s) = 2-4s
	 * ```
	 */
	maxJitter?: number;
};

/**
 * Automatically retries requests based on the `Retry-After` header per
 * [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
 *
 * Applies to `429` and `503` responses with valid `Retry-After` headers.
 *
 * **Behavior:**
 * - Success (2xx): passed through immediately
 * - Missing/invalid `Retry-After`: no retry, response returned as-is
 * - Numeric values: delay-seconds (e.g., `"120"`)
 * - HTTP-date values: absolute time in IMF-fixdate format
 * - Full-jitter: added `random(0, min(maxJitter, delay))` jitter on top of `delay` when configured
 * - Throws `AbortError` when delay exceeds `maxDelayTime` or `INT32_MAX` (~24.8 days)
 * - Returns last response when `maxRetries` exhausted (no throw)
 *
 * **Streaming bodies:** Cannot be retried per Fetch spec. Use a body factory middleware.
 *
 * @example
 * ```ts
 * const qfetch = withRetryAfter({ maxRetries: 3, maxJitter: 5_000 })(fetch);
 * ```
 */
export const withRetryAfter: Middleware<RetryAfterOptions | undefined> = (
	opts = {},
) => {
	const statuses = new Set([429, 503]);
	const header = "Retry-After";

	const maxRetries =
		typeof opts.maxRetries !== "number" ||
		opts.maxRetries < 0 ||
		Number.isNaN(opts.maxRetries)
			? undefined
			: opts.maxRetries;

	const maxDelayTime =
		typeof opts.maxDelayTime !== "number" ||
		opts.maxDelayTime < 0 ||
		Number.isNaN(opts.maxDelayTime)
			? undefined
			: opts.maxDelayTime;

	const maxJitter =
		typeof opts.maxJitter !== "number" ||
		opts.maxJitter < 0 ||
		Number.isNaN(opts.maxJitter)
			? undefined
			: opts.maxJitter;

	return (next) => async (input, init) => {
		let response = await next(input, init);

		for (
			let attempt = 0;
			maxRetries === undefined || attempt < maxRetries;
			attempt += 1
		) {
			// If successful or not a retryable status, passthrough the response
			if (response.ok || !statuses.has(response.status)) {
				break;
			}

			// Check for Retry-After header
			const delay = parseRetryAfter(response.headers.get(header));

			// If no Retry-After header, passthrough the response
			if (delay === null) break;

			// Enforce ceiling on retry delay
			if (maxDelayTime !== undefined && delay > maxDelayTime)
				throw new DOMException(
					`Exceeded maximum ceiling for Retry-After value: expected up to ${maxDelayTime}, received ${delay}`,
					"AbortError",
				);

			// Enforce INT32_MAX constraint for setTimeout
			if (delay > INT32_MAX)
				throw new DOMException(
					`Retry-After delay exceeds maximum safe setTimeout value: expected up to ${INT32_MAX}, received ${delay}`,
					"AbortError",
				);

			// Calculate a jitter to prevent thundering herd
			const jitter = Math.min(maxJitter ?? 0, Math.random() * delay);

			// Consume the previous response body in case of retry - it is done after the throws on purpose, so other
			// upstream middleware in the chain that might reference the response can safely use it.
			await response.body?.cancel("Retry scheduled").catch(() => {
				// Note: If cancellation fails, the response body may remain in memory until garbage collected,
				// potentially consuming resources. However, this is a best-effort cleanup that shouldn't block retries.
			});

			// Wait before retrying, adding jitter only if it keeps totalDelay within INT32_MAX
			await waitFor(Math.min(delay + jitter, INT32_MAX));

			// Retry the original request
			response = await next(input, init);
		}

		return response;
	};
};

/**
 * Wait for the specified amount of time.
 *
 * @param delay - Duration to wait in milliseconds. Negative values are treated as zero.
 * @returns A promise that resolves after the delay has elapsed.
 */
const waitFor = (delay: number): Promise<void> => {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, delay);
	});
};

/**
 * Regular expression matching a `Retry-After` header value expressed as
 * *delta-seconds*, as defined in [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
 *
 * A valid delta-seconds value consists solely of one or more ASCII digits.
 * Example: `"120"`.
 *
 * @see RFC 9110 §10.2.3 — Retry-After
 */
const RFC_9110_DELTA_SECONDS = /^\d+$/;

/**
 * Regular expression matching a `Retry-After` header value expressed as an
 * *HTTP-date*, in the IMF-fixdate format defined by
 * [RFC 9110 §5.6.7](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.7).
 *
 * This format corresponds to dates such as `"Wed, 21 Oct 2015 07:28:00 GMT"`.
 * The pattern enforces:
 * - A three-letter weekday abbreviation with an initial capital (e.g. `Mon`–`Sun`)
 * - A two-digit day, three-letter month, four-digit year
 * - A 24-hour time in `HH:MM:SS` format
 * - A literal `"GMT"` timezone designator
 *
 * @see RFC 9110 §5.6.7 — Date/Time Formats
 * @see RFC 9110 §10.2.3 — Retry-After
 */
const RFC_9110_HTTP_DATE =
	/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * Maximum signed 32-bit integer (2^31 − 1).
 *
 * Used to ensure values passed to `setTimeout` do not exceed the maximum
 * 32-bit range. `setTimeout` clamps delays above this limit, which cause
 * them to be set to `1` (immediate).
 */
const INT32_MAX = 0x7fffffff;

/**
 * Parses a `Retry-After` header according to RFC 9110 §10.2.3.
 *
 * - If the value is an integer, it is interpreted as a delay in seconds since the parsing.
 * - If the value is an HTTP-date, it is interpreted as the difference
 *   between that time and the current time.
 * - Invalid values return `null`.
 *
 * @param value - The raw `Retry-After` header value.
 * @returns The delay duration in milliseconds, or `null` if invalid.
 */
const parseRetryAfter = (value: string | null): null | number => {
	if (value === null) return null;

	if (RFC_9110_DELTA_SECONDS.test(value)) {
		const seconds = Number(value);
		const milliseconds = seconds * 1000;
		return Number.isSafeInteger(milliseconds) ? milliseconds : null;
	}

	if (RFC_9110_HTTP_DATE.test(value)) {
		const date = new Date(value);
		const difference = Math.max(0, date.getTime() - Date.now());
		return Number.isSafeInteger(difference) ? difference : null;
	}

	return null;
};
