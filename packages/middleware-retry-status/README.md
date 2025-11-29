# @qfetch/middleware-retry-status

## Overview

Middleware that automatically retries failed HTTP requests based on response status codes that indicate transient errors. Implements retry logic for standard retryable HTTP status codes (408, 429, 500, 502, 503, 504) as defined in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes), using configurable backoff strategies from [`@proventuslabs/retry-strategies`](https://github.com/proventuslabs/js/tree/main/packages/retry-strategies).

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-retry-status
```

This middleware requires [`@proventuslabs/retry-strategies`](https://github.com/proventuslabs/js/tree/main/packages/retry-strategies) as a peer dependency:

```bash
npm install @proventuslabs/retry-strategies
```

## Usage

### Basic Usage

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { LinearBackoff, upto } from '@proventuslabs/retry-strategies';

// Retry up to 3 times with linear backoff
const qfetch = withRetryStatus({
  strategy: () => upto(3, new LinearBackoff(1000, 5000))
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### Custom Retryable Status Codes

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { LinearBackoff, upto } from '@proventuslabs/retry-strategies';

// Only retry on specific status codes
const qfetch = withRetryStatus({
  strategy: () => upto(3, new LinearBackoff(1000, 5000)),
  retryableStatuses: new Set([429, 503])
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

## API

### `withRetryStatus(options)`

Creates a middleware that automatically retries failed HTTP requests based on retryable status codes.

#### Parameters

- **`options`** (`RetryStatusOptions`, required): Configuration options for retry behavior

#### Returns

A middleware function compatible with `@qfetch/core`.

### `RetryStatusOptions`

Configuration object for the retry status middleware.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strategy` | `() => BackoffStrategy` | Required | Factory function that creates a backoff strategy. Returns a new strategy instance for each request chain. Use `upto()` to limit retry attempts. |
| `retryableStatuses` | `ReadonlySet<number>` | `new Set([408, 429, 500, 502, 503, 504])` | Set of HTTP status codes that should trigger automatic retries. Override to customize which status codes are retryable. |

## Behavior

### Key Features

- **Automatic retry on transient failures**: Retries requests that fail with retryable status codes. By default, retries on 408, 429, 500, 502, 503, 504. The set of retryable status codes can be customized via the `retryableStatuses` option. Successful responses (2xx) and non-retryable errors are returned immediately without retries.
- **Configurable backoff strategy**: Uses a provided backoff strategy to compute delays between retry attempts. The strategy controls both the delay duration and when to stop retrying (by returning `NaN`).
- **Retry limit control**: Limit the number of retry attempts by wrapping your strategy with the `upto()` function from `@proventuslabs/retry-strategies`. The middleware continues retrying until the strategy returns `NaN`.
- **Request body cleanup**: Automatically cancels the response body stream before retrying to prevent memory leaks. This is a best-effort operation that won't block retries if cancellation fails.
- **AbortSignal support**: Respects `AbortSignal` from the request to allow cancellation during retry delays. If the signal is aborted, the wait is interrupted and an error is thrown.

### Retryable Status Codes

By default, the following HTTP status codes trigger automatic retries (per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes)):

- **408 Request Timeout** - The server timed out waiting for the request
- **429 Too Many Requests** - Rate limiting is in effect
- **500 Internal Server Error** - Generic server error
- **502 Bad Gateway** - Invalid response from upstream server
- **503 Service Unavailable** - Server temporarily unavailable
- **504 Gateway Timeout** - Upstream server timeout

This default set can be overridden using the `retryableStatuses` option to customize which status codes should trigger retries.

### Edge Cases

- **Successful responses**: 2xx status codes are returned immediately without retrying
- **Non-retryable errors**: Client errors (4xx except 408, 429) and other status codes (e.g., 501) are returned without retrying
- **Strategy exhaustion**: When the backoff strategy returns `NaN`, retrying stops and the last response is returned
- **Abort signal**: If the request's `AbortSignal` is triggered during a retry delay, an error is thrown
- **Response body cleanup failure**: If cancelling a response body fails, retries continue but the body may remain in memory until garbage collected

## Limitations

- **No automatic `Retry-After` header handling**: The middleware does not automatically parse or respect `Retry-After` response headers. The backoff strategy is solely responsible for computing retry delays. To respect `Retry-After` headers, use a separate middleware that parses the header and follows its semantic.
- **Non-idempotent requests**: The middleware retries all requests regardless of HTTP method. Be cautious when using with non-idempotent methods (POST, PATCH) as retries may cause duplicate operations if the initial request partially succeeded.
- **Request body consumption**: If the request has a body stream that can only be read once (e.g., a `ReadableStream`), retries will fail. Use repeatable body types (string, Blob, FormData, ArrayBuffer) or implement request cloning separately.
- **Memory considerations**: Failed response bodies are cancelled before retrying, but if cancellation fails, the body may remain in memory until garbage collected.
- **Delay limits**: Delay values exceeding INT32_MAX (2147483647ms, approximately 24.8 days) will throw a `RangeError`.

## Standards References

- [RFC 9110 - HTTP Semantics (Status Codes)](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes)
- [MDN - HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [MDN - Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN - AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
