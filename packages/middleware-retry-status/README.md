# @qfetch/middleware-retry-status

Fetch middleware for **client-controlled** retry timing based on response status codes.

## Overview

Retries transient failures using configurable backoff strategies. When a response has a retryable status code (by default `408`, `429`, `500`, `502`, `503`, `504`), the middleware waits according to the strategy before retrying.

Unlike `@qfetch/middleware-retry-after`, this middleware does **not** parse `Retry-After` headers—retry timing is entirely client-controlled via the backoff strategy. Use this for general retry logic; use `middleware-retry-after` when server timing directives should be respected.

Use configurable backoff strategies from [`@proventuslabs/retry-strategies`](https://jsr.io/@proventuslabs/retry-strategies) to control delay patterns (linear, exponential, jitter) and retry limits.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Important Limitations

> **Replayable vs. Non-Replayable Bodies**
> Most request bodies — such as strings, `Blob`, `ArrayBuffer`, `Uint8Array`, `FormData`, and `URLSearchParams` — are **replayable**. Fetch recreates their internal body stream for each retry attempt, so these requests can be retried safely without any special handling.

> **Non-Replayable Bodies (Streaming Bodies)**
> Requests whose body is a non-replayable type — such as `ReadableStream` — **cannot be retried** according to the Fetch specification. Attempting to retry such requests results in a `TypeError` because the body stream has already been consumed.
>
> To support retries for streaming bodies, you must provide a *body factory* using a middleware downstream that creates a **fresh stream** for each retry.

## Installation

```bash
npm install @qfetch/middleware-retry-status @proventuslabs/retry-strategies
```

## API

### `withRetryStatus(options)`

Creates a middleware that retries failed requests based on response status codes.

#### Options

- `strategy: () => BackoffStrategy` **(required)** - Factory function that creates a backoff strategy for retry delays
  - The strategy determines how long to wait between retry attempts
  - Controls when to stop retrying by returning `NaN`
  - A new strategy instance is created for each request chain
  - Use `upto()` wrapper from `@proventuslabs/retry-strategies` to limit retry attempts
  - Common strategies: `linear()`, `exponential()`, `fullJitter()`
- `retryableStatuses?: ReadonlySet<number>` - Set of HTTP status codes that trigger automatic retries (default: `new Set([408, 429, 500, 502, 503, 504])`)
  - Only responses with these status codes will be retried
  - Override to customize which status codes should trigger retry behavior
  - Common codes: `408` (Request Timeout), `429` (Too Many Requests), `500` (Internal Server Error), `502` (Bad Gateway), `503` (Service Unavailable), `504` (Gateway Timeout)
  - Use an empty set (`new Set()`) to disable all automatic retries

#### Behavior

- **Successful responses** (status 2xx) are returned immediately without retrying
- **Retryable statuses** - By default, only `408`, `429`, `500`, `502`, `503`, and `504` status codes trigger retry logic. This can be customized using the `retryableStatuses` option
- **Non-retryable statuses** - Client errors (4xx except 408 and 429) and other status codes are returned immediately without retrying
- **Backoff strategy**:
  - The strategy determines how long to wait between retry attempts
  - Strategy controls when to stop retrying by returning `NaN`
  - Use `upto()` wrapper to limit the number of retry attempts
  - Common strategies include `linear()`, `exponential()`, and `fullJitter()`
- **Request body cleanup**:
  - Automatically cancels the response body stream before retrying to prevent memory leaks
  - This is a best-effort operation that won't block retries if cancellation fails
- **Error handling**:
  - Exceeding INT32_MAX (2,147,483,647 milliseconds or ~24.8 days) for delay throws a `RangeError`
  - When the strategy returns `NaN`, retrying stops and the last response is returned (no error thrown)
- **Cancellation support**:
  - Respects `AbortSignal` passed via request options or `Request` object
  - Cancellation during retry wait period immediately aborts and throws the abort reason
  - Cancellation during retry request execution propagates the abort signal to the fetch call

## Usage

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { fullJitter, upto } from '@proventuslabs/retry-strategies';

const qfetch = withRetryStatus({
  strategy: () => upto(3, fullJitter(100, 10_000))
})(fetch);

await qfetch('https://api.example.com/data');
```

## Notes

- Does **not** parse `Retry-After` headers—use `@qfetch/middleware-retry-after` for server-directed timing
- Retries on `408`, `429`, `500`, `502`, `503`, `504` by default (customizable via `retryableStatuses`)
- Use `linear()`, `exponential()`, or `fullJitter()` strategies for different backoff patterns
- Use `upto()` wrapper to limit retry attempts
- Response bodies are automatically cancelled before retrying to prevent memory leaks

## Standards References

- [RFC 9110 - Status Codes](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes) - HTTP status code definitions
- [RFC 9110 §15.5.9 - 408 Request Timeout](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.9) - Client timeout status
- [RFC 9110 §15.6 - Server Error 5xx](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6) - Server error status codes
