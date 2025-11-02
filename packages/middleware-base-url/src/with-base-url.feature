Feature: Automatic base URL application for relative fetch requests

  The middleware automatically applies a configured base URL to outgoing requests
  that use URLs.

  Rule: Base URL validation

    The middleware must ensure that a valid base URL is provided.
    Invalid or malformed base URLs cause immediate configuration errors.

    Scenario: Provided base URL is invalid
      Given a middleware configuration with base URL "not-a-valid-url"
      When the middleware is initialized
      Then an error is thrown indicating the base URL is invalid

    Scenario: Provided base URL is valid
      Given a middleware configuration with base URL "http://api.local"
      When the middleware is initialized
      Then no error is thrown


  Rule: Request URL resolution for relative and absolute paths

    The middleware prepends or resolves paths against the configured base URL
    to produce the final request destination. This mirrors the standard URL
    constructor behaviour.

    Scenario: Request made with a relative path
      Given the configured base URL is "http://api.local/v1/"
      When a request is made to "users"
      Then the underlying fetch is called with URL "http://api.local/v1/users"

    Scenario: Request made with an absolute path
      Given the configured base URL is "http://api.local/v1/"
      When a request is made to "/users"
      Then the underlying fetch is called with URL "http://api.local/users"

    Scenario: Request made with a fully qualified URL
      Given the configured base URL is "http://api.local/v1/"
      When a request is made to "https://example.com/data"
      Then the underlying fetch is called with URL "https://example.com/data"
      And the base URL is ignored
