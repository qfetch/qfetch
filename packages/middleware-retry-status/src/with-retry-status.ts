import { type BackoffStrategy, waitFor } from "@proventuslabs/retry-strategies";
import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withRetryStatus} middleware.
 *
 * @remarks
 * This middleware handles **client-controlled** retry timing. When a response has a
 * retryable status code, the middleware uses the backoff strategy to determine wait
 * times between attempts. Unlike `withRetryAfter`, this middleware ignores server
 * timing directives and relies entirely on the configured strategy.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes RFC 9110 - Status Codes}
 */
export type RetryStatusOptions = {
	/**
	 * Factory function that creates a backoff strategy for retry delays.
	 *
	 * The strategy determines the delay between retry attempts and when to stop retrying
	 * (by returning `NaN`). Wrap with `upto()` to limit retry attempts.
	 *
	 * @example
	 * ```typescript
	 * import { linear, upto } from "@proventuslabs/retry-strategies";
	 *
	 * strategy: () => upto(3, linear(1000, 10_000))
	 * ```
	 */
	strategy: () => BackoffStrategy;

	/**
	 * Set of HTTP status codes that should trigger automatic retries.
	 *
	 * Defaults to the standard retryable status codes: `408`, `429`, `500`, `502`, `503`, `504`.
	 * Override to customize which status codes should be retried.
	 *
	 * @default new Set([408, 429, 500, 502, 503, 504])
	 */
	retryableStatuses?: ReadonlySet<number>;
};

/**
 * Middleware that retries requests based on response status codes.
 *
 * @remarks
 * Handles **client-controlled** retry timing for transient failures. When a response
 * has a retryable status code (by default `408`, `429`, `500`, `502`, `503`, `504`),
 * the middleware waits according to the backoff strategy before retrying.
 *
 * Unlike `withRetryAfter`, this middleware does not parse `Retry-After` headers.
 * Use this for general retry logic; use `withRetryAfter` when server timing matters.
 *
 * @param opts - Configuration parameters. See {@link RetryStatusOptions} for details.
 *
 * @throws {unknown} If the request's `AbortSignal` is aborted during retry delay.
 * @throws {RangeError} If the strategy delay exceeds maximum safe timeout (~24.8 days).
 *
 * @example
 * ```ts
 * import { withRetryStatus } from "@qfetch/middleware-retry-status";
 * import { fullJitter, upto } from "@proventuslabs/retry-strategies";
 *
 * const qfetch = withRetryStatus({
 *   strategy: () => upto(3, fullJitter(100, 10_000))
 * })(fetch);
 * ```
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes RFC 9110 - Status Codes}
 */
export const withRetryStatus: Middleware<RetryStatusOptions> = (opts) => {
	// Get the set of retryable status codes, defaulting to the standard set
	const retryableStatuses =
		opts.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

	return (next) => async (input, init) => {
		// Extract the signal for this request
		const signal =
			init?.signal ?? (input instanceof Request ? input.signal : undefined);
		// Get a new strategy for this chain of retries
		const strategy = opts.strategy();

		let response = await next(input, init);

		while (true) {
			// If successful or not a retryable status, passthrough the response
			if (response.ok || !retryableStatuses.has(response.status)) break;

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

			// Wait before retrying
			await waitFor(delay, signal);

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
 * Default HTTP status codes that indicate a retryable condition.
 * - `408 Request Timeout`
 * - `429 Too Many Requests`
 * - `500 Internal Server Error`
 * - `502 Bad Gateway`
 * - `503 Service Unavailable`
 * - `504 Gateway Timeout`
 */
const DEFAULT_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
	408, 429, 500, 502, 503, 504,
]);
