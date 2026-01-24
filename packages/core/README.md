# @qfetch/core

Core framework for composable fetch middlewares.

## Overview

Provides TypeScript types and composition utilities for building middleware that wraps the native `fetch` API. Create reusable request/response processing logic through a clean middleware pattern.

## Installation

```bash
npm install @qfetch/core
```

## Quick Start

```typescript
import { compose, pipeline, type Middleware } from '@qfetch/core';

// Create a simple logging middleware
const withLogger: Middleware = () => (next) => async (input, init) => {
  console.log('Request:', input);
  const response = await next(input, init);
  console.log('Response:', response.status);
  return response;
};

// Compose middlewares (right-to-left execution)
const qfetch = compose(
  withLogger(),
  // other middlewares...
)(fetch);

// Or use pipeline for left-to-right execution
const qfetch2 = pipeline(
  withLogger(),
  // other middlewares...
)(fetch);

await qfetch('https://api.example.com/users');
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_core.html).

## Standards References

- [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) - Native fetch interface
- [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/) - Fetch specification
