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

### URL Resolution Reference

String inputs follow the URL constructor standard behavior: `new URL(input, base)`

```typescript
const base = "https://api.example.com/v1/";

// Case 1: Relative URLs → resolved against base
new URL("users", base)        // → "https://api.example.com/v1/users"

// Case 2: Absolute paths → replaces pathname
new URL("/users", base)       // → "https://api.example.com/users"

// Case 3: Absolute URLs with scheme → base ignored
new URL("https://other.com/data", base)  // → "https://other.com/data"
```

### Important Note: Trailing Slashes

A trailing slash (`/`) is recommended at the end of the base URL.
Without it, the `URL` constructor treats the final path segment as a filename and replaces it instead of appending new paths:

```typescript
new URL("users", "https://api.example.com/v1");  // → "https://api.example.com/users"
new URL("users", "https://api.example.com/v1/"); // → "https://api.example.com/v1/users"
```

## Usage

### Basic Usage

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

- Only **string inputs** are resolved against the base URL using `new URL(input, base)`
- URL and Request objects are passed through unchanged
- URL resolution follows the WHATWG URL Standard
- Query parameters and fragments are always preserved
- A trailing slash in the base URL is recommended for predictable relative path resolution

## Standards References

- [WHATWG URL Standard](https://url.spec.whatwg.org/) - Defines URL resolution behavior
- [MDN: URL API](https://developer.mozilla.org/en-US/docs/Web/API/URL) - Browser implementation documentation
- [Fetch Standard](https://fetch.spec.whatwg.org/) - Defines Request and fetch API semantics
