# @qfetch/middleware-base-url

Middleware for applying a base URL to relative fetch requests.

## Overview

Automatically resolves relative request URLs against a configured base URL, mirroring the behavior of the native `URL` constructor.  
Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-base-url
```

## API

### `withBaseUrl(base: string | URL)`

Creates a middleware that resolves relative request paths against the given base URL.

#### Behavior

* Relative paths (e.g. `"users"`) are appended to the base URL.
* Leading slashes (e.g. `"/users"`) resolve to the base URL’s origin root.
* Fully qualified URLs (e.g. `"https://example.com/data"`) are passed through unchanged.
* `Request` objects are left unmodified, since their URLs are already fully qualified.

#### Note

A trailing slash (`/`) is required at the end of the base URL.
Without it, the `URL` constructor replaces the final path segment instead of appending new paths:

```typescript
new URL("users", "https://api.example.com/v1");  // → "https://api.example.com/users"
new URL("users", "https://api.example.com/v1/"); // → "https://api.example.com/v1/users"
```

## Usage

```typescript
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { compose } from '@qfetch/core';

// Create a fetch instance with a base URL
const qfetch = compose(
  withBaseUrl('https://api.example.com/v1/')
)(fetch);

// Relative path → resolved against the base
await qfetch('users'); // → https://api.example.com/v1/users

// Leading slash → resolves to origin root
await qfetch('/users'); // → https://api.example.com/users

// Fully qualified URL → left unchanged
await qfetch('https://external.com/data'); // → https://external.com/data
```

## Notes

* The middleware respects the semantics of the Fetch API — existing `Request` objects are never modified.
* Base URL logic only applies to string or `URL` inputs.
* The resolved URL behavior matches the standard `URL` constructor in browsers and workers.
