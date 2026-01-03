# @qfetch/middleware-base-url

Fetch middleware for automatically resolving URLs against a configured base URL.

## Overview

Automatically resolves **string** request URLs against a configured base URL following standard URL constructor behavior:

**String inputs (resolved using `new URL(input, base)`):**
- **Relative URLs** (like `"users"`) → resolved against the base URL
- **Absolute paths** (like `"/users"`) → replaces the base URL's pathname (keeps protocol + host from base)
- **Absolute URLs with scheme** (like `"https://example.com/data"`) → ignores the base URL entirely

**URL objects and Request objects:**
- Passed through unchanged, as they already contain absolute URLs

This middleware strictly follows the [URL Standard](https://url.spec.whatwg.org/) for predictable and standards-compliant behavior.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-base-url
```

## API

### `withBaseUrl(options)`

Creates a middleware that resolves request URLs against the given base URL using standard URL resolution.

#### Options

- Base URL (`string | URL`) **(required)** - The base URL to resolve requests against
  - Accepts either a string or URL instance
  - Must be a valid URL (throws `TypeError` if invalid)
  - Trailing slash recommended for predictable path resolution
  - Example: `"https://api.example.com/v1/"` or `new URL("https://api.example.com/v1/")`

#### Behavior

The middleware only applies base URL resolution to **string inputs**, following the URL constructor standard behavior:

**String inputs (resolved using `new URL(input, base)`):**
- **Relative URLs** (e.g., `"users"`) → resolved against the base URL
- **Absolute paths** (e.g., `"/users"`) → replaces the base URL's pathname (keeps protocol + host from base)
- **Absolute URLs with scheme** (e.g., `"https://..."`) → ignores the base URL entirely

**URL objects:**
- Passed through unchanged (already contain absolute URLs)

**Request objects:**
- Passed through unchanged (already contain absolute URLs)

**General behavior:**
- **Type preservation** - Input types are preserved (string→string, URL→URL, Request→Request)
- **Query parameters and fragments** - Always preserved during URL resolution

## Usage

```typescript
import { withBaseUrl } from '@qfetch/middleware-base-url';

const qfetch = withBaseUrl('https://api.example.com/v1/')(fetch);

// Relative URLs → resolved against base
await qfetch('users');  // → https://api.example.com/v1/users

// Absolute paths → replaces pathname (keeps protocol + host)
await qfetch('/users'); // → https://api.example.com/users

// Absolute URLs with scheme → base ignored
await qfetch('https://external.com/data'); // → https://external.com/data
```


## Notes

- Only **string inputs** are resolved; `URL` and `Request` objects pass through unchanged
- Resolution follows WHATWG URL Standard: `new URL(input, base)`
- Trailing slash recommended: `"v1/"` appends paths, `"v1"` replaces the last segment
- Query parameters and fragments are always preserved

## Standards References

- [WHATWG URL Standard](https://url.spec.whatwg.org/) - Defines URL resolution behavior
- [MDN: URL API](https://developer.mozilla.org/en-US/docs/Web/API/URL) - Browser implementation documentation
- [Fetch Standard](https://fetch.spec.whatwg.org/) - Defines Request and fetch API semantics
