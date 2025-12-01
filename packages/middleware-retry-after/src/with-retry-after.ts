import { type BackoffStrategy, waitFor } from "@proventuslabs/retry-strategies";
import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withRetryAfter} middleware.
 *
 * Controls retry behavior for requests with `429` or `503` responses that include a `Retry-After` header.
 */
export type RetryAfterOptions = {
	/**
	 * Factory function that creates a backoff strategy for retry delays.
	 *
	 * The strategy determines additional jitter to add to the `Retry-After` delay and when to stop
	 * retrying (by returning `NaN`). Total wait time is `Retry-After + strategy.nextBackoff()`.
	 * Wrap with `upto()` to limit retry attempts.
	 *
	 * @example
	 * ```typescript
	 * import { fullJitter, upto } from "@proventuslabs/retry-strategies";
	 *
	 * strategy: () => upto(3, fullJitter(100, 10_000))
	 * ```
	 */
	strategy: () => BackoffStrategy;

	/**
	 * Maximum delay in milliseconds accepted from the server for a single retry.
	 *
	 * Enforces a ceiling on the `Retry-After` delay. Throws `ConstraintError` if exceeded.
	 *
	 * @default undefined (unlimited)
	 */
	maxServerDelay?: number;

	/**
	 * Set of HTTP status codes that should trigger automatic retries.
	 *
	 * Defaults to the standard retryable status codes: `429`, `503`.
	 * Override this to customize which status codes should be retried.
	 *
	 * @default new Set([429, 503])
	 */
	retryableStatuses?: ReadonlySet<number>;
};

/**
 * Middleware that automatically retries HTTP requests based on server-provided `Retry-After` headers.
 *
 * Retries requests that fail with `429 Too Many Requests` or `503 Service Unavailable` status codes
 * when a valid `Retry-After` header is present. Supports both delay-seconds (`"120"`) and HTTP-date
 * formats (`"Wed, 21 Oct 2015 07:28:00 GMT"`) per [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
 *
 * The middleware waits for the server-requested delay plus optional strategy backoff, then retries
 * the request. Use the strategy to add jitter and control retry limits (strategy returns `NaN` to stop).
 * Responses without `Retry-After` headers or with invalid values are returned immediately without retrying.
 *
 * @param opts - Configuration parameters. See {@link RetryAfterOptions} for details.
 *
 * @throws {DOMException} `ConstraintError` when server delay exceeds `maxServerDelay`.
 * @throws {unknown} If the request's `AbortSignal` is aborted during retry delay.
 * @throws {RangeError} If total delay exceeds INT32_MAX (2147483647ms).
 *
 * @example
 * ```ts
 * import { withRetryAfter } from "@qfetch/middleware-retry-after";
 * import { fullJitter, upto } from "@proventuslabs/retry-strategies";
 *
 * const qfetch = withRetryAfter({
 *   strategy: () => upto(3, fullJitter(100, 10_000)),
 *   maxServerDelay: 120_000 // 2 minutes max
 * })(fetch);
 *
 * const response = await qfetch("https://api.example.com/data");
 * ```
 */
export const withRetryAfter: Middleware<RetryAfterOptions> = (opts) => {
	const maxServerDelay =
		typeof opts.maxServerDelay !== "number" || opts.maxServerDelay < 0
			? NaN
			: opts.maxServerDelay;

	// Get the set of retryable status codes, defaulting to the standard set
	const retryableStatuses =
		opts.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

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
 * Regular expression matching `Retry-After` delay-seconds format (e.g., `"120"`).
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3}
 */
const DELTA_SECONDS = /^\d+$/;

/**
 * Regular expression matching `Retry-After` HTTP-date format (e.g., `"Wed, 21 Oct 2015 07:28:00 GMT"`).
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3}
 */
const HTTP_DATE =
	/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * HTTP status codes that indicate retryable conditions: `429` and `503`.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585.html#section-4 RFC 6585 §4}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4 RFC 9110 §15.6.4}
 */
const DEFAULT_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 503]);

/**
 * The `Retry-After` HTTP response header name.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3}
 */
const RETRY_AFTER_HEADER = "Retry-After";

/**
 * Parses a `Retry-After` header value to milliseconds.
 *
 * Supports delay-seconds (`"120"`) and HTTP-date (`"Wed, 21 Oct 2015 07:28:00 GMT"`) formats.
 * Past dates return zero delay. Invalid values return `null`.
 *
 * @param value - The raw `Retry-After` header value, or `null` if missing.
 * @returns Delay in milliseconds, or `null` if invalid or missing.
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3 RFC 9110 §10.2.3}
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
