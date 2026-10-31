"""Keep the declared API surface synchronized with API_CONTRACT v5.6."""

from app.main import app

EXPECTED = {
    (method, path)
    for method, path in (
        line.split(" ", 1)
        for line in """
POST /auth/register
POST /auth/register/send-otp
POST /auth/login
POST /auth/google
POST /auth/google/link
POST /auth/refresh
POST /auth/logout
POST /auth/forgot-password
POST /auth/verify-otp
POST /auth/reset-password
GET /users/me
PUT /users/me
PUT /users/me/password
DELETE /users/me
GET /settings
PUT /settings
POST /settings/reset
GET /admin/users
PUT /admin/users/{user_id}/lock
PUT /admin/users/{user_id}/unlock
DELETE /admin/users/{user_id}
POST /detect/single-face
POST /detect/finalize
POST /detect/manual
POST /solve
POST /history
GET /history
GET /history/{history_id}
GET /statistics
POST /practice/attempts
GET /practice/attempts
GET /practice/leaderboard
GET /practice/daily-challenge
POST /practice/daily-challenge/attempts
GET /practice/daily-challenge/leaderboard
""".strip().splitlines()
    )
}


def test_openapi_has_every_contract_endpoint_and_no_placeholder_response() -> None:
    paths = app.openapi()["paths"]
    actual = {
        (method.upper(), path)
        for path, operations in paths.items()
        for method in operations
        if method in {"get", "post", "put", "delete"} and path != "/health"
    }
    assert actual == EXPECTED
    for path, operations in paths.items():
        for method, operation in operations.items():
            if method in {"get", "post", "put", "delete"}:
                assert "422" not in operation["responses"], (method, path)
                assert "501" not in operation["responses"], (method, path)
                expected_status = "201" if (method, path) in {
                    ("post", "/auth/register"), ("post", "/history"),
                    ("post", "/practice/attempts"), ("post", "/practice/daily-challenge/attempts")
                } else "200"
                assert expected_status in operation["responses"], (method, path)
