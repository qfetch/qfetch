# @qfetch/middlewares

Collection of all qfetch middlewares - convenience package for importing all middlewares at once.

## Overview

This package re-exports all official qfetch middlewares with pinned versions, providing a single import point for all middleware functionality.

**Included middlewares:**
- `@qfetch/middleware-authorization` - Authorization header injection with 401 retry
- `@qfetch/middleware-base-url` - Base URL resolution
- `@qfetch/middleware-query-params` - Query parameter management
- `@qfetch/middleware-retry-after` - Retry-After header handling
- `@qfetch/middleware-retry-status` - Status code based retry

## Installation

```bash
npm install @qfetch/middlewares @qfetch/core
```

## Usage

```typescript
import {
  withAuthorization,
  withBaseUrl,
  withQueryParams,
  withRetryAfter,
  withRetryStatus,
} from "@qfetch/middlewares";
import { compose } from "@qfetch/core";

const qfetch = compose(
  withRetryStatus({ statuses: [500, 502, 503], strategy: () => /* ... */ }),
  withRetryAfter(),
  withQueryParams({ version: "v2" }),
  withBaseUrl("https://api.example.com")
)(fetch);

await qfetch("/users");
```

## Individual Packages

For more control over versions or to reduce bundle size, you can install middlewares individually:

```bash
npm install @qfetch/middleware-base-url @qfetch/middleware-retry-status
```

## API

All exports from individual middleware packages are re-exported:

### Authorization
- `withAuthorization(opts)` - Adds authorization headers with 401 retry
- `AuthorizationOptions`, `AuthorizationToken`, `TokenProvider` types

### Base URL
- `withBaseUrl(baseUrl)` - Resolves relative URLs against a base URL

### Query Params
- `withQueryParam(name, value, opts?)` - Adds a single query parameter
- `withQueryParams(params, opts?)` - Adds multiple query parameters
- `ArrayFormat`, `QueryParamOptions`, `QueryParamsOptions`, `QueryValue` types

### Retry-After
- `withRetryAfter(opts?)` - Handles Retry-After response headers
- `RetryAfterOptions` type

### Retry Status
- `withRetryStatus(opts)` - Retries on specific HTTP status codes
- `RetryStatusOptions` type

## Version Policy

This package pins exact versions of all middleware dependencies to ensure consistent behavior. When new middleware versions are released, this package will be updated with a corresponding version bump.
