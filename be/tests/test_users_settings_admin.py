from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.refresh_token import RefreshToken
from app.models.settings import Settings
from app.models.user import User
from app.services import users as users_service


def register(
    client: TestClient,
    username: str,
    email: str,
    display_name: str,
) -> dict[str, Any]:
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    response = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "password123",
            "display_name": display_name,
            "otp_code": client.registration_codes[email],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def bearer(auth: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


def assert_error(
    response: Any,
    status_code: int,
    error_code: str,
    details: dict[str, Any] | None = None,
) -> None:
    assert response.status_code == status_code
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == error_code
    assert isinstance(body["message"], str) and body["message"]
    if details is None:
        assert "details" not in body
    else:
        assert body["details"] == details


@pytest.fixture()
def user_auth(client: TestClient) -> dict[str, Any]:
    return register(client, "normal_user", "normal@example.com", "Normal User")


@pytest.fixture()
def admin_auth(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> dict[str, Any]:
    auth = register(client, "admin_user", "admin@example.com", "Admin User")
    with session_factory() as db:
        admin = db.scalar(select(User).where(User.username == "admin_user"))
        assert admin is not None
        admin.role = "admin"
        db.commit()
    return auth


def test_get_me_matches_contract_and_serializes_utc(
    client: TestClient,
    user_auth: dict[str, Any],
) -> None:
    response = client.get("/users/me", headers=bearer(user_auth))

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert set(body["data"]) == {
        "id",
        "username",
        "email",
        "display_name",
        "avatar",
        "role",
        "status",
        "created_at",
        "google_linked",
        "has_password",
    }
    assert body["data"]["username"] == "normal_user"
    assert body["data"]["avatar"] is None
    assert body["data"]["status"] == "active"
    assert body["data"]["google_linked"] is False
    assert body["data"]["has_password"] is True
    assert body["data"]["created_at"].endswith("Z")


def test_update_me_changes_display_name_and_ignores_extra_form_field(
    client: TestClient,
    user_auth: dict[str, Any],
) -> None:
    response = client.put(
        "/users/me",
        headers=bearer(user_auth),
        data={"display_name": "  Tên mới  ", "unknown": "ignored"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["display_name"] == "Tên mới"

    invalid = client.put(
        "/users/me",
        headers=bearer(user_auth),
        data={"display_name": "   "},
    )
    assert_error(
        invalid,
        400,
        "VALIDATION_ERROR",
        {"fields": {"display_name": "Thiếu trường display_name"}},
    )


def test_update_me_saves_png_avatar(
    client: TestClient,
    user_auth: dict[str, Any],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(users_service, "AVATAR_DIR", tmp_path)
    png = b"\x89PNG\r\n\x1a\n" + b"avatar-content"
    response = client.put(
        "/users/me",
        headers=bearer(user_auth),
        files={"avatar": ("avatar.png", png, "image/png")},
    )

    assert response.status_code == 200
    avatar_url = response.json()["data"]["avatar"]
    assert avatar_url == "http://testserver/uploads/avatars/1.png"
    assert (tmp_path / "1.png").read_bytes() == png


@pytest.mark.parametrize(
    ("filename", "content", "content_type", "error_code"),
    [
        ("avatar.gif", b"GIF89a", "image/gif", "INVALID_FILE_TYPE"),
        ("avatar.png", b"not-a-real-png", "image/png", "INVALID_FILE_TYPE"),
        (
            "avatar.png",
            b"\x89PNG\r\n\x1a\n" + b"x" * (2 * 1024 * 1024),
            "image/png",
            "FILE_TOO_LARGE",
        ),
    ],
    ids=["unsupported-mime", "spoofed-png", "over-2mb"],
)
def test_update_me_rejects_invalid_avatar(
    client: TestClient,
    user_auth: dict[str, Any],
    filename: str,
    content: bytes,
    content_type: str,
    error_code: str,
) -> None:
    response = client.put(
        "/users/me",
        headers=bearer(user_auth),
        files={"avatar": (filename, content, content_type)},
    )
    assert_error(response, 400, error_code)


def test_change_password_validates_and_revokes_refresh_tokens(
    client: TestClient,
    user_auth: dict[str, Any],
    session_factory: sessionmaker[Session],
) -> None:
    wrong = client.put(
        "/users/me/password",
        headers=bearer(user_auth),
        json={"old_password": "wrong-password", "new_password": "newpassword123"},
    )
    assert_error(wrong, 401, "WRONG_OLD_PASSWORD")

    weak = client.put(
        "/users/me/password",
        headers=bearer(user_auth),
        json={"old_password": "password123", "new_password": "short"},
    )
    assert_error(weak, 400, "WEAK_PASSWORD")

    changed = client.put(
        "/users/me/password",
        headers=bearer(user_auth),
        json={"old_password": "password123", "new_password": "newpassword123"},
    )
    assert changed.status_code == 200
    assert changed.json() == {
        "success": True,
        "data": {"message": "Đổi mật khẩu thành công"},
    }

    with session_factory() as db:
        tokens = db.scalars(select(RefreshToken)).all()
        assert tokens and all(token.revoked for token in tokens)

    old_login = client.post(
        "/auth/login",
        json={"identifier": "normal_user", "password": "password123"},
    )
    assert_error(old_login, 401, "INVALID_CREDENTIALS")
    new_login = client.post(
        "/auth/login",
        json={"identifier": "normal_user", "password": "newpassword123"},
    )
    assert new_login.status_code == 200


def test_get_settings_creates_exact_defaults_once(
    client: TestClient,
    user_auth: dict[str, Any],
    session_factory: sessionmaker[Session],
) -> None:
    first = client.get("/settings", headers=bearer(user_auth))
    second = client.get("/settings", headers=bearer(user_auth))

    expected = {
        "success": True,
        "data": {
            "solving_method": "KOCIEMBA",
            "theme": "light",
            "animation_speed": "normal",
            "camera_config": {"resolution": "720p", "auto_focus": True},
        },
    }
    assert first.status_code == 200
    assert first.json() == expected
    assert second.json() == expected
    with session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Settings)) == 1


def test_update_settings_deep_merges_camera_config(
    client: TestClient,
    user_auth: dict[str, Any],
) -> None:
    response = client.put(
        "/settings",
        headers=bearer(user_auth),
        json={
            "theme": "dark",
            "camera_config": {"resolution": "1080p"},
            "ignored": "value",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {
            "solving_method": "KOCIEMBA",
            "theme": "dark",
            "animation_speed": "normal",
            "camera_config": {"resolution": "1080p", "auto_focus": True},
        },
    }

    focus = client.put(
        "/settings",
        headers=bearer(user_auth),
        json={"camera_config": {"auto_focus": False}},
    )
    assert focus.json()["data"]["camera_config"] == {
        "resolution": "1080p",
        "auto_focus": False,
    }


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"solving_method": "BEGINNER"}, "solving_method"),
        ({"solving_method": "CFOP"}, "solving_method"),
        ({"theme": "blue"}, "theme"),
        ({"animation_speed": "instant"}, "animation_speed"),
        ({"camera_config": {"resolution": "4K"}}, "camera_config.resolution"),
    ],
)
def test_update_settings_returns_contract_error_for_invalid_enum(
    client: TestClient,
    user_auth: dict[str, Any],
    payload: dict[str, Any],
    field: str,
) -> None:
    response = client.put("/settings", headers=bearer(user_auth), json=payload)
    assert_error(response, 400, "INVALID_SETTING_VALUE", {"field": field})


def test_update_settings_rejects_wrong_nested_type(
    client: TestClient,
    user_auth: dict[str, Any],
) -> None:
    response = client.put(
        "/settings",
        headers=bearer(user_auth),
        json={"camera_config": {"auto_focus": "false"}},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "VALIDATION_ERROR"
    assert "camera_config.auto_focus" in response.json()["details"]["fields"]


def test_admin_list_requires_admin_and_matches_contract_fields(
    client: TestClient,
    user_auth: dict[str, Any],
    admin_auth: dict[str, Any],
) -> None:
    forbidden = client.get("/admin/users", headers=bearer(user_auth))
    assert_error(forbidden, 403, "FORBIDDEN")

    register(client, "alice_user", "alice@example.com", "Alice Smith")
    response = client.get("/admin/users?page=1&limit=2", headers=bearer(admin_auth))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["limit"] == 2
    assert len(data["items"]) == 2
    assert set(data["items"][0]) == {
        "id",
        "username",
        "email",
        "display_name",
        "role",
        "status",
        "created_at",
    }
    assert data["items"][0]["created_at"].endswith("Z")


def test_admin_list_search_and_include_deleted(
    client: TestClient,
    admin_auth: dict[str, Any],
    session_factory: sessionmaker[Session],
) -> None:
    register(client, "alpha_user", "alpha@example.com", "Needle Name")
    register(client, "deleted_user", "deleted@example.com", "Deleted")
    with session_factory() as db:
        deleted = db.scalar(select(User).where(User.username == "deleted_user"))
        assert deleted is not None
        deleted.status = "deleted"
        db.commit()

    searched = client.get(
        "/admin/users?search=NEEDLE",
        headers=bearer(admin_auth),
    )
    assert searched.status_code == 200
    assert [item["username"] for item in searched.json()["data"]["items"]] == [
        "alpha_user"
    ]

    default_list = client.get("/admin/users", headers=bearer(admin_auth))
    assert default_list.json()["data"]["total"] == 2
    with_deleted = client.get(
        "/admin/users?include_deleted=true",
        headers=bearer(admin_auth),
    )
    assert with_deleted.json()["data"]["total"] == 3


@pytest.mark.parametrize("query", ["page=0", "limit=0", "limit=101"])
def test_admin_list_validates_pagination(
    client: TestClient,
    admin_auth: dict[str, Any],
    query: str,
) -> None:
    response = client.get(f"/admin/users?{query}", headers=bearer(admin_auth))
    assert_error(
        response,
        400,
        "VALIDATION_ERROR",
        response.json()["details"],
    )


def test_admin_lock_and_unlock_user(
    client: TestClient,
    admin_auth: dict[str, Any],
) -> None:
    target_auth = register(client, "target_user", "target@example.com", "Target")
    target_id = target_auth["user"]["id"]

    locked = client.put(
        f"/admin/users/{target_id}/lock",
        headers=bearer(admin_auth),
    )
    assert locked.status_code == 200
    assert locked.json() == {
        "success": True,
        "data": {"id": target_id, "status": "locked"},
    }

    unlocked = client.put(
        f"/admin/users/{target_id}/unlock",
        headers=bearer(admin_auth),
    )
    assert unlocked.status_code == 200
    assert unlocked.json() == {
        "success": True,
        "data": {"id": target_id, "status": "active"},
    }


def test_admin_cannot_modify_self_admin_deleted_or_missing_user(
    client: TestClient,
    admin_auth: dict[str, Any],
    session_factory: sessionmaker[Session],
) -> None:
    admin_id = admin_auth["user"]["id"]
    self_response = client.put(
        f"/admin/users/{admin_id}/lock",
        headers=bearer(admin_auth),
    )
    assert_error(self_response, 403, "CANNOT_MODIFY_SELF")

    other_admin_auth = register(
        client,
        "other_admin",
        "other-admin@example.com",
        "Other Admin",
    )
    deleted_auth = register(
        client,
        "deleted_target",
        "deleted-target@example.com",
        "Deleted Target",
    )
    with session_factory() as db:
        other_admin = db.get(User, other_admin_auth["user"]["id"])
        deleted = db.get(User, deleted_auth["user"]["id"])
        assert other_admin is not None and deleted is not None
        other_admin.role = "admin"
        deleted.status = "deleted"
        db.commit()

    other_admin_response = client.put(
        f"/admin/users/{other_admin_auth['user']['id']}/lock",
        headers=bearer(admin_auth),
    )
    assert_error(other_admin_response, 403, "CANNOT_MODIFY_ADMIN")

    deleted_response = client.put(
        f"/admin/users/{deleted_auth['user']['id']}/unlock",
        headers=bearer(admin_auth),
    )
    assert_error(deleted_response, 404, "USER_NOT_FOUND")

    missing_response = client.put(
        "/admin/users/999999/lock",
        headers=bearer(admin_auth),
    )
    assert_error(missing_response, 404, "USER_NOT_FOUND")


def test_delete_me_reset_settings_and_admin_delete(
    client: TestClient,
    user_auth: dict[str, Any],
    admin_auth: dict[str, Any],
) -> None:
    client.put("/settings", headers=bearer(user_auth), json={"theme": "dark"})
    reset_settings = client.post("/settings/reset", headers=bearer(user_auth))
    assert reset_settings.status_code == 200
    assert reset_settings.json()["data"] == {
        "solving_method": "KOCIEMBA",
        "theme": "light",
        "animation_speed": "normal",
        "camera_config": {"resolution": "720p", "auto_focus": True},
    }

    wrong = client.request(
        "DELETE",
        "/users/me",
        headers=bearer(user_auth),
        json={"password": "wrong"},
    )
    assert_error(wrong, 401, "INVALID_CREDENTIALS")
    deleted = client.request(
        "DELETE",
        "/users/me",
        headers=bearer(user_auth),
        json={"password": "password123"},
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"success": True, "data": {"message": "Đã xóa tài khoản"}}
    assert_error(client.get("/users/me", headers=bearer(user_auth)), 401, "UNAUTHORIZED")
    assert_error(
        client.post("/auth/refresh", json={"refresh_token": user_auth["refresh_token"]}),
        401,
        "INVALID_REFRESH_TOKEN",
    )
    assert_error(
        client.post("/auth/login", json={"identifier": "normal_user", "password": "password123"}),
        401,
        "INVALID_CREDENTIALS",
    )

    target_auth = register(client, "delete_target", "delete-target@example.com", "Delete Target")
    delete_user = client.delete(
        f"/admin/users/{target_auth['user']['id']}",
        headers=bearer(admin_auth),
    )
    assert delete_user.status_code == 200
    assert delete_user.json() == {"success": True, "data": {"message": "Đã xóa tài khoản"}}
    assert_error(client.get("/users/me", headers=bearer(target_auth)), 401, "UNAUTHORIZED")
    assert_error(client.delete(f"/admin/users/{admin_auth['user']['id']}", headers=bearer(admin_auth)), 403, "CANNOT_MODIFY_SELF")
