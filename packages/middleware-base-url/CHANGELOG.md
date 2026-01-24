# Changelog

## 0.1.0 (2026-01-24)


### ⚠ BREAKING CHANGES

* **middlewares:** Renamed core types for clarity
    - FetchFunction → FetchFn
    - FetchExecutor → MiddlewareExecutor
    - Removed Middleware<T> type (no longer needed)

### Features

* expand middleware signature ([#51](https://github.com/qfetch/qfetch/issues/51)) ([099c509](https://github.com/qfetch/qfetch/commit/099c5092e448a6ef360fe23d13969f27a19bf3e6))
* **middleware-base-url:** add base URL resolution middleware ([#11](https://github.com/qfetch/qfetch/issues/11)) ([b2ef233](https://github.com/qfetch/qfetch/commit/b2ef233101b1d47d8db14c7ae45b466fa644e1ad))


### Code Refactoring

* **middlewares:** slim READMEs and refactor core types for TypeDoc ([#73](https://github.com/qfetch/qfetch/issues/73)) ([03d95cb](https://github.com/qfetch/qfetch/commit/03d95cb206ceb4c1fd649890a02781dd039efa5d))
