# Changelog

## 0.1.0 (2026-01-24)


### ⚠ BREAKING CHANGES

* **middlewares:** Renamed core types for clarity
    - FetchFunction → FetchFn
    - FetchExecutor → MiddlewareExecutor
    - Removed Middleware<T> type (no longer needed)

### Features

* **middleware-authorization:** add initial implementation ([#45](https://github.com/qfetch/qfetch/issues/45)) ([410dc4a](https://github.com/qfetch/qfetch/commit/410dc4ae3a64c93a24bca718ed12dd63a96fefef))


### Code Refactoring

* **middlewares:** slim READMEs and refactor core types for TypeDoc ([#73](https://github.com/qfetch/qfetch/issues/73)) ([03d95cb](https://github.com/qfetch/qfetch/commit/03d95cb206ceb4c1fd649890a02781dd039efa5d))
