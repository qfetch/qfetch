import { type BackoffStrategy, waitFor } from "@proventuslabs/retry-strategies";
import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withRetryAfter} middleware.
 *
 * @example
 * ```ts
 * import { fullJitter, upto } from "@proventuslabs/retry-strategies";
 *
 * {
 *   strategy: () => upto(3, fullJitter(100, 10_000)),
 *   maxServerDelay: 120_000
 * }
 * ```
 */
export type RetryAfterOptions = {
	/**
	 * Maximum delay in milliseconds accepted form the server for a single retry.
	 * - `0` = only instant retries
	 * - `>= 1` = ceiling on delay
	 * - Negative/NaN/undefined = unlimited
	 *
	 * @default undefined
	 */
	maxServerDelay?: number;

	/**
	 * Factory function that creates a backoff strategy for retry delays.
	 *
	 * The strategy determines how long to wait between retry attempts and when to stop
	 * retrying (by returning `NaN`). A new strategy instance is created for each request
	 * chain to ensure independent retry timing.
	 *
	 * To limit the number of retries, wrap the strategy with the `upto()` function from
	 * `@proventuslabs/retry-strategies`:
	 *
	 * @example
	 * ```ts
	 * import { fullJitter, upto } from "@proventuslabs/retry-strategies";
	 *
	 * // Limit to 3 retries adding full-jitter to the server delay
	 * strategy: () => upto(3, fullJitter(100, 10_000))
	 * ```
	 */
	strategy: () => BackoffStrategy;
};

/**
 * Automatically retries requests on `429` and `503` responses with valid `Retry-After` headers.
 *
 * **Behavior:**
 * - Success (2xx): passed through immediately
 * - Missing/invalid `Retry-After`: no retry, response returned as-is
 * - Numeric values: delay-seconds
 * - HTTP-date values: absolute future time, past dates are zero-delay
 * - Throws `ConstraintError` when delay exceeds `maxServerDelay` or `INT32_MAX` (~24.8 days)
 * - Returns last response when strategy exhausted (no throw)
 *
 * **Streaming bodies:** Cannot be retried per Fetch spec. Use a body factory middleware downstream.
 *
 * **Cancellation:** Honors `AbortSignal` during retry waits and request execution. Aborting the signal
 * immediately cancels pending retries and throws `AbortError`.
 *
 * @throws {DOMException} `ConstraintError` when the server delay exceeds `maxServerDelay`
 * @throws {unknown} The reason of the AbortSignal if the operation is aborted (generally {@link DOMException} `AbortError`).
 * @throws {RangeError} If the total delay exceeds INT32_MAX (2147483647ms, approximately 24.8 days).
 * @example
 * ```ts
 * import { fullJitter, upto } from "@proventuslabs/retry-strategies";
 *
 * const qfetch = withRetryAfter({
 *   strategy: () => upto(3, fullJitter(100, 10_000))
 * })(fetch);
 * ```
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3 — Retry-After}
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585.html#section-4 RFC 6585 §4 — 429 Too Many Requests}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4 RFC 9110 §15.6.4 — 503 Service Unavailable}
 */
export const withRetryAfter: Middleware<RetryAfterOptions> = (opts) => {
	const maxServerDelay =
		typeof opts.maxServerDelay !== "number" || opts.maxServerDelay < 0
			? NaN
			: opts.maxServerDelay;

	// Get the set of retryable status codes, defaulting to the standard set
	const retryableStatuses =
		// opts.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;
		DEFAULT_RETRYABLE_STATUSES;

	return (next) => async (input, init) => {
		// Extract the signal for this request
		const requestSignal =
			init?.signal ?? (input instanceof Request ? input.signal : undefined);
		// Get a new strategy for this chain of retries
		const strategy = opts.strategy();

		let response = await next(input, init);

		while (true) {
			// If successful or not a retryable status, passthrough the response
			if (response.ok || !retryableStatuses.has(response.status)) break;

			// Check for Retry-After header
			const serverDelay = parseRetryAfter(
				response.headers.get(RETRY_AFTER_HEADER),
			);

			// If no Retry-After header, passthrough the response
			if (serverDelay === null) break;

			// Compute the next backoff delay
			const delay = strategy.nextBackoff();

			// When the strategy says we should stop, passthrough the response
			if (Number.isNaN(delay)) break;

			// Consume the previous response body in case of retry - it is done before throws so that
			// we guarantee that the body is canceled in case of any error
			await response.body?.cancel(CANCEL_REASON).catch(() => {
				// Note: If cancellation fails, the response body may remain in memory until garbage collected,
				// potentially consuming resources. However, this is a best-effort cleanup that shouldn't block retries.
			});

			// Enforce ceiling on retry delay
			if (serverDelay > maxServerDelay)
				throw new DOMException(
					`Retry-After delay exceeds maximum ceiling: expected up to ${maxServerDelay}, received ${serverDelay}`,
					"ConstraintError",
				);

			// Wait before retrying
			await waitFor(serverDelay + delay, requestSignal);

			// Retry the original request
			response = await next(input, init);
		}

		return response;
	};
};

/**
 * The reason passed to body cancellation.
 */
export const CANCEL_REASON = "Retry scheduled";

/**
 * Regular expression matching a `Retry-After` header value expressed as
 * *delta-seconds*.
 *
 * @example "120"
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3 — Retry-After}
 */
const DELTA_SECONDS = /^\d+$/;

/**
 * Regular expression matching a `Retry-After` header value expressed as an
 * *HTTP-date*, in the IMF-fixdate format.
 *
 * @example "Wed, 21 Oct 2015 07:28:00 GMT"
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.7 RFC 9110 §5.6.7 — Date/Time Formats}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3 — Retry-After}
 */
const HTTP_DATE =
	/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * HTTP status codes that indicate a retryable condition.
 * - `429`: Too Many Requests
 * - `503`: Service Unavailable
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585.html#section-4 RFC 6585 §4 — 429 Too Many Requests}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4 RFC 9110 §15.6.4 — 503 Service Unavailable}
 */
const DEFAULT_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 503]);

/**
 * The `Retry-After` header name.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3 — Retry-After}
 */
const RETRY_AFTER_HEADER = "Retry-After";

/**
 * Parses a `Retry-After` header.
 *
 * - If the value is an integer, it is interpreted as a delay in seconds since the parsing.
 * - If the value is an HTTP-date, it is interpreted as the difference
 *   between that time and the current time.
 * - Invalid values return `null`.
 *
 * @param value - The raw `Retry-After` header value.
 * @returns The delay duration in milliseconds, or `null` if invalid.
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3 — Retry-After}
 */
const parseRetryAfter = (value: string | null): null | number => {
	if (value === null) return null;

	if (DELTA_SECONDS.test(value)) {
		const seconds = new Number(value);
		const milliseconds = seconds.valueOf() * 1000;
		return Number.isSafeInteger(milliseconds) ? milliseconds : null;
	}

	if (HTTP_DATE.test(value)) {
		const date = new Date(value);
		const difference = Math.max(0, date.getTime() - Date.now());
		return Number.isSafeInteger(difference) ? difference : null;
	}

	return null;
};
