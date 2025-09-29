# @qfetch/core

Core framework for composable fetch middlewares.

## Overview

Provides TypeScript types and composition utilities for building middleware that wraps the native `fetch` API. Create reusable request/response processing logic through a clean middleware pattern.

## Installation

```bash
npm install @qfetch/core
```

## API

### Types

- `FetchFunction` - Compatible with native fetch API
- `MiddlewareExecutor` - Function that wraps a fetch function with middleware logic
- `Middleware<T>` - Factory for creating middleware executors with optional configuration

### Composition

- `compose(...middlewares)` - Right-to-left composition (functional style)
- `pipeline(...middlewares)` - Left-to-right composition (pipeline style)

## Usage

```typescript
import { compose, pipeline, type Middleware } from '@qfetch/core';

// Create a simple middleware
const withLogger: Middleware = () => (next) => async (input, init) => {
  console.log('Request:', input);
  const response = await next(input, init);
  console.log('Response:', response.status);
  return response;
};

// Compose with other middlewares
const qfetch = compose(
  withLogger(),
  // other middlewares...
)(fetch);

// Or use pipeline for left-to-right execution
const qfetch2 = pipeline(
  withLogger(),
  // other middlewares...
)(fetch);
```

