Feature: Apply base URL to fetch requests

  The middleware automatically applies a configured base URL to outgoing requests.

  Rule: The base URL must be valid

    The middleware must ensure that a valid base URL is provided.
    Invalid or malformed base URLs cause immediate configuration errors.

    Scenario: Provided base URL is invalid
      Given the base URL is "not-a-valid-url"
      When the middleware is initialized
      Then an error is thrown indicating the base URL is invalid

    Scenario: Provided base URL is valid
      Given the base URL is "http://api.local"
      When the middleware is initialized
      Then no error is thrown


  Rule: Request destination are rewritten with the base URL

    The middleware prepends or resolves paths against the configured base URL
    to produce the final request destination. This mirrors the standard URL
    constructor behaviour.

    Scenario: Request made with a relative path
      Given the base URL is "http://api.local/v1/"
      When a request is made to "users"
      Then the request is rewritten to "http://api.local/v1/users"

    Scenario: Request made with an absolute path
      Given the base URL is "http://api.local/v1/"
      When a request is made to "/users"
      Then the request is rewritten to "http://api.local/users"

    Scenario: Request made with a fully qualified URL
      Given the base URL is "http://api.local/v1/"
      When a request is made to "https://example.com/data"
      Then the request is rewritten to "https://example.com/data"
