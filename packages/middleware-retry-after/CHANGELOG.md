# Changelog

## [0.1.1](https://github.com/qfetch/qfetch/compare/middleware-retry-after@v0.1.0...middleware-retry-after@v0.1.1) (2026-01-24)


### Bug Fixes

* **jsr:** add imports map for npm and jsr dependencies ([e8d0926](https://github.com/qfetch/qfetch/commit/e8d0926cb11ffd3d05d56384545dc71776a62c93))

## 0.1.0 (2026-01-24)


### ⚠ BREAKING CHANGES

* **middlewares:** Renamed core types for clarity
    - FetchFunction → FetchFn
    - FetchExecutor → MiddlewareExecutor
    - Removed Middleware<T> type (no longer needed)

### Features

* expand middleware signature ([#51](https://github.com/qfetch/qfetch/issues/51)) ([099c509](https://github.com/qfetch/qfetch/commit/099c5092e448a6ef360fe23d13969f27a19bf3e6))
* **middleware-retry-after:** add initial implementation ([#19](https://github.com/qfetch/qfetch/issues/19)) ([643d633](https://github.com/qfetch/qfetch/commit/643d633706f771a4a7ed53ec260be9cf1dfa208b))


### Code Refactoring

* **middlewares:** slim READMEs and refactor core types for TypeDoc ([#73](https://github.com/qfetch/qfetch/issues/73)) ([03d95cb](https://github.com/qfetch/qfetch/commit/03d95cb206ceb4c1fd649890a02781dd039efa5d))
