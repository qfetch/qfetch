# @qfetch/middleware-response-error

## Overview

Middleware that automatically throws errors for HTTP responses based on their status codes. By default, throws a `ResponseError` for any response with status code >= 400. Provides flexible error customization through status-specific mappers and a default fallback, allowing consumers to standardize error handling across their application.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-response-error
```

## Usage

```typescript
import { withResponseError, ResponseError } from '@qfetch/middleware-response-error';

// Zero-config usage - throws ResponseError for status >= 400
const qfetch = withResponseError()(fetch);

try {
  await qfetch('https://api.example.com/users/123');
} catch (error) {
  if (error instanceof ResponseError) {
    console.log(error.status);     // 404
    console.log(error.statusText); // "Not Found"
    console.log(error.url);        // "https://api.example.com/users/123"
    // Read response body if needed
    const body = await error.response.json();
  }
}
```

### Custom Error Mapping

```typescript
import { withResponseError } from '@qfetch/middleware-response-error';

class NotFoundError extends Error {
  constructor(url: string) {
    super(`Resource not found: ${url}`);
    this.name = 'NotFoundError';
  }
}

class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const qfetch = withResponseError({
  // Map specific status codes to custom errors
  statusMap: new Map([
    [404, (res) => new NotFoundError(res.url)],
    // Async mappers can read the response body
    [400, async (res) => {
      const body = await res.json();
      return new ApiError(body.code, body.message);
    }],
  ]),
  // Custom default for unmapped error status codes
  defaultMapper: async (res) => {
    const text = await res.text();
    return new Error(`API Error ${res.status}: ${text}`);
  },
})(fetch);
```

### Conditional Throwing

```typescript
import { withResponseError } from '@qfetch/middleware-response-error';

// Only throw for server errors (5xx), let client errors through
const qfetch = withResponseError({
  throwOnStatusCode: (code) => code >= 500,
})(fetch);

const response = await qfetch('/api/validate');
if (response.status === 400) {
  // Handle validation errors without try/catch
  const errors = await response.json();
}
```

### Composition with Other Middlewares

```typescript
import { withResponseError } from '@qfetch/middleware-response-error';
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withResponseError(), // Throws after retries are exhausted
  withRetryStatus({ strategy: () => upto(3, zero()) }),
)(fetch);
```

## API

### `withResponseError(opts?)`

Creates a middleware that throws errors for HTTP responses based on status codes.

#### Parameters

- `opts` - Optional configuration object:
  - `statusMap?: Map<number, ResponseErrorMapper>` - Maps specific status codes to custom error mappers. Takes priority over `defaultMapper`.
  - `defaultMapper?: ResponseErrorMapper` - Creates errors for status codes not in `statusMap`. Defaults to `(response) => new ResponseError(response)`.
  - `throwOnStatusCode?: (code: number) => boolean` - Determines whether to throw for a given status code. Defaults to `(code) => code >= 400`.

#### Types

```typescript
type ResponseErrorMapper = (response: Response) => unknown | Promise<unknown>;
```

#### Returns

A middleware function compatible with `@qfetch/core`.

### `ResponseError`

Default error class thrown for failed HTTP responses.

#### Properties

- `status: number` - The HTTP status code
- `statusText: string` - The HTTP status text
- `url: string` - The URL of the failed request
- `response: Response` - The full response object (body can still be read)
- `message: string` - Formatted as `"HTTP {status} {statusText}: {url}"`

## Behavior

- **Successful responses (status < 400)**: Pass through unchanged
- **Error responses (status >= 400)**: Throw an error using the configured mapper
- **Async mappers**: Fully supported for reading response body before throwing
- **Response preservation**: The original `Response` object is preserved in `ResponseError` for later body reading

## Standards References

- [MDN: Response.ok](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok)
- [MDN: HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
