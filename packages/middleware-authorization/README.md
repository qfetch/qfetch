# @qfetch/middleware-authorization

Fetch middleware for automatic `Authorization` header injection with retry on `401 Unauthorized` responses.

## Overview

Automatically injects `Authorization` headers using a flexible `TokenProvider` interface. When a `401 Unauthorized` response is received, the middleware refreshes the token and retries according to the configured backoff strategy.

Use configurable backoff strategies from [`@proventuslabs/retry-strategies`](https://jsr.io/@proventuslabs/retry-strategies) to control retry delays and limits.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-authorization @proventuslabs/retry-strategies
```

## API

### `withAuthorization(options)`

Creates a middleware that injects authorization headers and retries on 401 responses.

#### Options

- `tokenProvider: TokenProvider` **(required)** - Provider instance that supplies authorization credentials
  - Called before each request to retrieve the current token
  - Called again before each retry attempt, allowing token refresh
  - Must return an object with `accessToken` (string) and `tokenType` (string) properties
- `strategy: () => BackoffStrategy` **(required)** - Factory function that creates a backoff strategy for retry delays
  - The strategy determines how long to wait between retry attempts
  - Controls when to stop retrying by returning `NaN`
  - A new strategy instance is created for each request chain
  - Use `upto()` wrapper from `@proventuslabs/retry-strategies` to limit retry attempts

#### Types

```typescript
type TokenProvider = {
  getToken(): Promise<AuthorizationToken>;
};

type AuthorizationToken = {
  accessToken: string; // The credential value (e.g., JWT, API key)
  tokenType: string;   // The authorization scheme (e.g., "Bearer", "Basic")
};
```

#### Behavior

- **Header injection** - Calls `tokenProvider.getToken()` and constructs the `Authorization` header as `<tokenType> <accessToken>`
- **Existing headers** - Respects existing `Authorization` headers and does not override them; token provider is not called when header already exists
- **401 retry** - On `401 Unauthorized` responses, refreshes the token and retries according to the strategy
- **Request body cleanup** - Automatically cancels the response body stream before retrying to prevent memory leaks
- **Error handling**:
  - Token provider errors propagate directly to the caller
  - Invalid tokens (missing properties) throw `TypeError`
  - Exceeding INT32_MAX (~24.8 days) for delay throws `RangeError`
- **Cancellation support** - Respects `AbortSignal` passed via request options or `Request` object

## Usage

```typescript
import { withAuthorization } from "@qfetch/middleware-authorization";
import { constant, upto } from "@proventuslabs/retry-strategies";

const qfetch = withAuthorization({
  tokenProvider: {
    getToken: async () => ({
      accessToken: "my-api-token",
      tokenType: "Bearer",
    }),
  },
  strategy: () => upto(1, constant(0)),
})(fetch);

await qfetch("https://api.example.com/data");
```

## Notes

- Supports any authorization scheme: `Bearer`, `Basic`, `Token`, or custom schemes
- Only `401` status triggers retry; other error statuses pass through unchanged
- Does not handle concurrent request token refresh coordination—implement in your `TokenProvider` if needed
- Works with string URLs, `URL` objects, and `Request` objects

## Standards References

- [RFC 9110 - 401 Unauthorized](https://www.rfc-editor.org/rfc/rfc9110.html#name-401-unauthorized) - Unauthorized status code
- [RFC 9110 - Authorization](https://www.rfc-editor.org/rfc/rfc9110.html#name-authorization) - Authorization header
- [RFC 6750 - Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html) - Bearer authentication scheme
- [RFC 7617 - Basic Authentication](https://www.rfc-editor.org/rfc/rfc7617.html) - Basic authentication scheme
