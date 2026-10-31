# API CONTRACT — Ứng dụng Nhận diện và Hướng dẫn giải khối Rubik (v5.6)

> Tài liệu dùng chung giữa Backend (`be/`) và Frontend (`fe/`).
> **Nguồn chuẩn tuyệt đối về endpoint/field/status code.** Khi API và Use Case mâu thuẫn, **API Contract này được ưu tiên** (Use Case coi như tài liệu nghiệp vụ tham khảo, cần cập nhật lại sau nếu lệch).
> Mọi thay đổi phải sửa file này trước, ghi lại ở "Lịch sử thay đổi" cuối file, rồi mới sửa code.

---

## 0. QUY ƯỚC CHUNG

- **Base URL (dev)**: `http://localhost:8000`
- **Xác thực**: JWT Bearer Token — header `Authorization: Bearer <access_token>`
- **Access token**: hạn 60 phút. **Refresh token**: hạn 7 ngày, dùng với `POST /auth/refresh`.
- **Content-Type**: `application/json`, trừ endpoint upload ảnh dùng `multipart/form-data`
- **Đăng nhập bằng**: `identifier` (email HOẶC username) + `password`
- **Mọi endpoint Detection, Solver, History, Statistics, Settings, Practice đều YÊU CẦU đăng nhập.** Resource (`rubik_state_id`/`solution_id`/`history.id`/`practice_attempt.id`) luôn gắn `user_id`; không thuộc user hiện tại → trả `404` (không tiết lộ tồn tại hay không).
- **Field thừa trong request body**: backend **bỏ qua im lặng**, không trả lỗi, không xử lý.
- **Soft-delete tài khoản**: tài khoản bị xóa (`DELETE /users/me` hoặc `DELETE /admin/users/{id}`) được đánh dấu `status = "deleted"`, không xóa vật lý khỏi DB.
  - Đăng nhập bằng tài khoản đã xóa → `INVALID_CREDENTIALS` (401) — giống hệt sai mật khẩu, không phân biệt.
  - Gọi bất kỳ API nào bằng access/refresh token phát hành trước đó của tài khoản đã xóa → `UNAUTHORIZED` (401).

### Format response thành công
```json
{ "success": true, "data": { ... } }
```

### Format response lỗi
```json
{
  "success": false,
  "error_code": "INVALID_CUBE_STATE",
  "message": "Thông báo lỗi tiếng Việt, hiển thị trực tiếp cho người dùng",
  "details": { }
}
```
`details` là object **tùy chọn** — chỉ xuất hiện khi lỗi cần kèm dữ liệu bổ sung. Không có thì bỏ hẳn field, không trả `null`.

### Mã lỗi dùng chung cho MỌI endpoint
| error_code | Status | Khi nào |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Thiếu field bắt buộc, field rỗng, sai kiểu dữ liệu, JSON không parse được. `details: { "fields": {"email": "Thiếu trường email"} }` |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập / token hết hạn / token không hợp lệ / token thuộc tài khoản đã bị xóa |
| `FORBIDDEN` | 403 | Đã đăng nhập nhưng không đủ quyền |
| `NOT_FOUND` | 404 | Route/resource không tồn tại (dùng khi không có mã riêng cụ thể hơn) |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống không lường trước |

---

## 1. AUTH

### POST /auth/register/send-otp
**Request**: `{ "email": "user@example.com" }`

**Response 200**: `{ "success": true, "data": { "message": "Đã gửi mã OTP tới email", "expires_in": 300 } }`

Chỉ gửi cho email chưa có tài khoản. Mã gồm 6 chữ số, hạn 5 phút, tối đa 5 lần nhập sai, gửi lại sau 60 giây; gửi lại làm mã cũ mất hiệu lực. Gửi mã không tạo tài khoản. Backend chỉ lưu mã và email, không lưu mật khẩu đăng ký trước khi xác thực.

**Lỗi riêng**
| error_code | Status | Mô tả |
|---|---|---|
| `INVALID_EMAIL_FORMAT` | 400 | Email sai định dạng |
| `EMAIL_EXISTS` | 409 | Email đã có tài khoản, kể cả tài khoản đã xóa |
| `OTP_RATE_LIMITED` | 429 | Gửi lại quá sớm |
| `EMAIL_SEND_FAILED` | 500 | Lỗi SMTP |

### POST /auth/register
**Request**
```json
{
  "username": "nguyenvana",
  "email": "user@example.com",
  "password": "password123",
  "display_name": "Nguyễn Văn A",
  "otp_code": "123456"
}
```
Quy tắc:
- `username`: 3-30 ký tự, chỉ gồm chữ thường a-z, số 0-9, dấu gạch dưới `_`, duy nhất trong hệ thống
- `email`: đúng định dạng chuẩn RFC email, duy nhất
- `password`: tối thiểu 8 ký tự
- `display_name`: 1-50 ký tự, không được rỗng
- `otp_code`: mã 6 chữ số đã gửi cho đúng email; kiểm tra thành công mới tạo tài khoản

**Response 201** — tự động đăng nhập, trả token (ghi đè hành vi "chuyển sang màn login" trong Use Case cũ):
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": 1, "username": "nguyenvana", "email": "user@example.com",
      "display_name": "Nguyễn Văn A", "avatar": null, "role": "user"
    }
  }
}
```

**Lỗi riêng**
| error_code | Status | Mô tả |
|---|---|---|
| `INVALID_USERNAME_FORMAT` | 400 | `username` có giá trị nhưng không khớp quy tắc (sai ký tự/độ dài) |
| `INVALID_EMAIL_FORMAT` | 400 | `email` có giá trị nhưng sai định dạng |
| `USERNAME_EXISTS` | 409 | Username đã tồn tại |
| `EMAIL_EXISTS` | 409 | Email đã tồn tại |
| `WEAK_PASSWORD` | 400 | Mật khẩu dưới 8 ký tự |
| `INVALID_OTP` | 400 | Mã sai, không tồn tại hoặc đã dùng |
| `OTP_EXPIRED` | 400 | Mã hết hạn |
| `OTP_MAX_ATTEMPTS` | 429 | Sai mã đủ 5 lần |

> Field thiếu/rỗng hoàn toàn (không phải sai định dạng) → dùng `VALIDATION_ERROR` chung, không dùng các mã riêng ở trên.

---

### POST /auth/login
**Request**
```json
{ "identifier": "user@example.com", "password": "password123" }
```

**Response 200**: giống data của register.

**Lỗi riêng**
| error_code | Status | Mô tả |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Sai identifier/mật khẩu, HOẶC tài khoản đã bị xóa |
| `ACCOUNT_LOCKED` | 403 | Tài khoản bị khóa (khác với bị xóa) |

---

### POST /auth/google
Google Identity Services trả ID token cho FE qua JavaScript callback; FE gửi token này đến BE. BE xác minh chữ ký, hạn dùng, issuer và audience bằng `GOOGLE_CLIENT_ID`, cho phép lệch đồng hồ tối đa 120 giây khi kiểm tra `iat`/`exp`, yêu cầu `email_verified = true`, dùng `sub` của Google làm định danh ổn định. FE không gửi Google access token hoặc Client Secret. Không cần OTP/mật khẩu cho tài khoản mới tạo bằng Google.

**Request**: `{ "id_token": "eyJ..." }`

**Response 200**: cùng cấu trúc `data` của `/auth/login`. Nếu `sub` đã liên kết tài khoản active thì đăng nhập tài khoản đó; nếu `sub` chưa liên kết và email chưa có trong hệ thống thì tạo tài khoản `user` active với `username` duy nhất tự sinh, `display_name` từ Google (tối đa 50 ký tự), `password_hash = null`, sau đó đăng nhập. Tài khoản mới có thể dùng luồng quên mật khẩu để tự đặt mật khẩu về sau. Không tự liên kết chỉ vì hai email trùng nhau.

**Lỗi riêng**
| error_code | Status | Mô tả |
|---|---|---|
| `INVALID_GOOGLE_TOKEN` | 401 | ID token thiếu/sai/hết hạn/sai audience, hoặc `sub`/email không hợp lệ |
| `GOOGLE_EMAIL_UNVERIFIED` | 403 | Google chưa xác minh email |
| `GOOGLE_LINK_REQUIRED` | 409 | Email đã có tài khoản hoặc đã bị xóa; tài khoản active phải đăng nhập bằng mật khẩu rồi liên kết trong Hồ sơ |
| `INVALID_CREDENTIALS` | 401 | Tài khoản đã liên kết Google nhưng đã bị xóa |
| `ACCOUNT_LOCKED` | 403 | Tài khoản Google đã liên kết nhưng bị khóa |
| `GOOGLE_NOT_CONFIGURED` | 503 | BE chưa có `GOOGLE_CLIENT_ID` |
| `GOOGLE_VERIFICATION_UNAVAILABLE` | 503 | Tạm thời không tải được khóa công khai của Google để xác minh token |

### POST /auth/google/link
Yêu cầu JWT Bearer của tài khoản active. Người dùng đăng nhập bằng mật khẩu trước, rồi bấm liên kết Google trong Hồ sơ. ID token phải có email đã xác minh và trùng email của tài khoản đang đăng nhập. `sub` không được liên kết tài khoản khác. Gọi lại với cùng `sub` của chính tài khoản này là idempotent.

**Request**: `{ "id_token": "eyJ..." }`

**Response 200**: `{ "success": true, "data": { "message": "Đã liên kết tài khoản Google" } }`

**Lỗi riêng**: `INVALID_GOOGLE_TOKEN` (401), `GOOGLE_EMAIL_UNVERIFIED` (403), `GOOGLE_ACCOUNT_MISMATCH` (409, email không trùng hoặc tài khoản đã liên kết Google khác), `GOOGLE_ACCOUNT_IN_USE` (409), `GOOGLE_NOT_CONFIGURED` (503), `GOOGLE_VERIFICATION_UNAVAILABLE` (503).

---

### POST /auth/refresh
**Request**
```json
{ "refresh_token": "eyJhbGciOi..." }
```
**Response 200**
```json
{ "success": true, "data": { "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "bearer" } }
```
Refresh token rotation: cấp mới, token cũ bị thu hồi ngay.

**Lỗi riêng**
| error_code | Status | Mô tả |
|---|---|---|
| `INVALID_REFRESH_TOKEN` | 401 | Sai/hết hạn/đã thu hồi/thuộc tài khoản đã xóa |

---

### POST /auth/logout
**Request** (yêu cầu `Authorization` header)
```json
{ "refresh_token": "eyJhbGciOi..." }
```
Thu hồi `refresh_token` này. Access token không bị thu hồi (chấp nhận còn hiệu lực tối đa 60 phút).

**Response 200**
```json
{ "success": true, "data": { "message": "Đăng xuất thành công" } }
```

---

### POST /auth/forgot-password
Bước 1/3, dùng được cả khi đã đăng nhập (để tài khoản chỉ dùng Google tạo mật khẩu). **Request**: `{ "email": "user@example.com" }`
**Response 200**: `{ "success": true, "data": { "message": "Đã gửi mã OTP tới email", "expires_in": 300 } }`

Quy tắc OTP: 6 chữ số, hạn 5 phút, tối đa 5 lần sai, gửi lại sau 60 giây, gửi lại thì vô hiệu mã cũ.

**Lỗi riêng**
| error_code | Status | Mô tả |
|---|---|---|
| `EMAIL_NOT_FOUND` | 404 | Email chưa đăng ký (hoặc thuộc tài khoản đã xóa) |
| `OTP_RATE_LIMITED` | 429 | Gửi lại quá sớm |
| `EMAIL_SEND_FAILED` | 500 | Lỗi SMTP |

### POST /auth/verify-otp
Bước 2/3. **Request**: `{ "email": "...", "otp_code": "123456" }`
**Response 200**: `{ "success": true, "data": { "reset_token": "eyJ...", "expires_in": 300 } }`

**Lỗi riêng**
| error_code | Status |
|---|---|
| `INVALID_OTP` | 400 |
| `OTP_EXPIRED` | 400 |
| `OTP_MAX_ATTEMPTS` | 429 |

### POST /auth/reset-password
Bước 3/3. **Request**: `{ "reset_token": "eyJ...", "new_password": "newpassword123" }` (tối thiểu 8 ký tự)
**Response 200**: `{ "success": true, "data": { "message": "Đặt lại mật khẩu thành công" } }`

**Lỗi riêng**
| error_code | Status |
|---|---|
| `INVALID_RESET_TOKEN` | 401 |
| `WEAK_PASSWORD` | 400 |

---

## 2. USER

### GET /users/me
```json
{
  "success": true,
  "data": {
    "id": 1, "username": "nguyenvana", "email": "user@example.com",
    "display_name": "Nguyễn Văn A",
    "avatar": "http://localhost:8000/uploads/avatars/1.jpg",
    "role": "user", "status": "active", "created_at": "2026-10-07T10:00:00Z",
    "google_linked": false, "has_password": true
  }
}
```

### PUT /users/me
`multipart/form-data`. `display_name` (optional, 1-50 ký tự nếu gửi), `avatar` file (optional, jpg/png, tối đa 2MB).
**Response 200**: giống GET /users/me

**Lỗi riêng**
| error_code | Status |
|---|---|
| `INVALID_FILE_TYPE` | 400 |
| `FILE_TOO_LARGE` | 400 |

### PUT /users/me/password
**Request**: `{ "old_password": "...", "new_password": "..." }` (mới tối thiểu 8 ký tự)
**Response 200**:
```json
{ "success": true, "data": { "message": "Đổi mật khẩu thành công" } }
```
**Lỗi riêng**: `WRONG_OLD_PASSWORD` (401), `WEAK_PASSWORD` (400)
Tài khoản chỉ dùng Google có `has_password = false`: dùng `/auth/forgot-password` → `/auth/verify-otp` → `/auth/reset-password` để tạo mật khẩu đầu tiên, rồi mới dùng endpoint này.

### DELETE /users/me
Soft-delete tài khoản của chính mình, thu hồi toàn bộ token hiện tại.
**Request**: `{ "password": "password123" }`
**Response 200**:
```json
{ "success": true, "data": { "message": "Đã xóa tài khoản" } }
```
**Lỗi riêng**: `INVALID_CREDENTIALS` (401) nếu sai mật khẩu xác nhận
Tài khoản chỉ dùng Google cần đặt mật khẩu qua luồng quên mật khẩu trước khi xóa.

---

## 3. SETTINGS

### GET /settings
```json
{
  "success": true,
  "data": {
    "solving_method": "KOCIEMBA",
    "theme": "light",
    "animation_speed": "normal",
    "camera_config": { "resolution": "720p", "auto_focus": true }
  }
}
```
Enum hợp lệ: `solving_method` = `KOCIEMBA` (chưa hỗ trợ `CFOP`); `theme` = `light`|`dark`; `animation_speed` = `slow`|`normal`|`fast`; `camera_config.resolution` = `480p`|`720p`|`1080p`.
Chưa có bản ghi → tự tạo mặc định: `KOCIEMBA / light / normal / 720p / auto_focus=true`.

### PUT /settings
Mọi field optional, **deep-merge theo field** — kể cả field con lồng trong `camera_config`. Ví dụ gửi `{"camera_config":{"resolution":"1080p"}}` thì `auto_focus` giữ nguyên giá trị cũ, chỉ `resolution` bị đổi.
Ví dụ request từ cài đặt mặc định: `{ "theme": "dark", "camera_config": { "resolution": "1080p" } }`.

**Response 200** — trả toàn bộ cài đặt sau khi cập nhật, không chỉ các field vừa gửi:
```json
{
  "success": true,
  "data": {
    "solving_method": "KOCIEMBA",
    "theme": "dark",
    "animation_speed": "normal",
    "camera_config": { "resolution": "1080p", "auto_focus": true }
  }
}
```
**Lỗi riêng**: `INVALID_SETTING_VALUE` (400) — giá trị ngoài enum, `details: {"field": "theme"}`

### POST /settings/reset
Khôi phục toàn bộ về mặc định, trả về như GET /settings.

---

## 4. ADMIN

### GET /admin/users?page=1&limit=20&search=&include_deleted=false
- `search`: khớp `username` OR `email` OR `display_name` (LIKE, không phân biệt hoa thường)
- `page`: số nguyên ≥ 1 (mặc định 1)
- `limit`: số nguyên 1-100 (mặc định 20)
- `include_deleted`: mặc định `false` — không hiện tài khoản đã soft-delete trong danh sách; `true` để hiện cả tài khoản đã xóa

**Lỗi riêng**: `VALIDATION_ERROR` (400) nếu `page < 1` hoặc `limit` ngoài khoảng 1-100

```json
{
  "success": true,
  "data": {
    "items": [
      { "id": 1, "username": "nguyenvana", "email": "user@example.com",
        "display_name": "Nguyễn Văn A", "role": "user", "status": "active",
        "created_at": "2026-10-07T10:00:00Z" }
    ],
    "total": 1, "page": 1, "limit": 20
  }
}
```

### PUT /admin/users/{id}/lock
```json
{ "success": true, "data": { "id": 1, "status": "locked" } }
```

### PUT /admin/users/{id}/unlock
```json
{ "success": true, "data": { "id": 1, "status": "active" } }
```

### DELETE /admin/users/{id}
```json
{ "success": true, "data": { "message": "Đã xóa tài khoản" } }
```

**Quy tắc & lỗi dùng chung cho lock/unlock/delete**
- Admin **không được** thao tác lên **chính mình**
- Admin **không được** thao tác lên **admin khác** (chỉ thao tác trên role=`user`)

| error_code | Status |
|---|---|
| `USER_NOT_FOUND` | 404 |
| `CANNOT_MODIFY_SELF` | 403 |
| `CANNOT_MODIFY_ADMIN` | 403 |

---

## 5. DETECTION (yêu cầu đăng nhập)

### 📌 PHỤ LỤC BẮT BUỘC ĐỌC TRƯỚC: Quy ước chụp 6 mặt khối Rubik

Để backend ghép đúng 54 ô thành 1 trạng thái vật lý hợp lệ, **frontend phải hướng dẫn người dùng chụp đúng theo quy ước xoay sau** (chỉ xoay khối, camera cố định):

**Tư thế chuẩn ban đầu**: cầm khối sao cho mặt `U` ở trên, mặt `F` hướng thẳng về phía người chụp/camera, mặt `R` ở bên phải.

1. **Chụp F**: giữ nguyên tư thế chuẩn, chụp thẳng vào mặt F.
   Hàng trên ảnh = giáp U · Hàng dưới = giáp D · Cột trái = giáp L · Cột phải = giáp R

2. **Chụp R**: xoay cả khối quanh trục đứng U-D, 90° sao cho mặt R quay ra hướng camera (giữ U vẫn ở trên). Chụp thẳng vào mặt đang hướng ra trước.
   Hàng trên = giáp U · Hàng dưới = giáp D · Cột trái = giáp F · Cột phải = giáp B

3. **Chụp B**: từ vị trí bước 2, xoay thêm 90° cùng chiều (tổng 180° so với ban đầu), giữ U ở trên. Chụp mặt đang hướng ra trước = B.
   Hàng trên = giáp U · Hàng dưới = giáp D · Cột trái = giáp R · Cột phải = giáp L

4. **Chụp L**: xoay thêm 90° cùng chiều (tổng 270°), giữ U ở trên. Chụp mặt đang hướng ra trước = L.
   Hàng trên = giáp U · Hàng dưới = giáp D · Cột trái = giáp B · Cột phải = giáp F

5. **Chụp U**: quay lại tư thế chuẩn ban đầu (F hướng ra trước), nghiêng/lật cả khối ra SAU quanh trục ngang trái-phải 90° để mặt U quay ra hướng camera.
   Hàng trên ảnh = cạnh U giáp B · Hàng dưới = cạnh U giáp F · Cột trái = giáp L · Cột phải = giáp R

6. **Chụp D**: từ tư thế chuẩn ban đầu, nghiêng cả khối ra TRƯỚC (ngược chiều bước 5) 90° để mặt D quay ra hướng camera.
   Hàng trên ảnh = cạnh D giáp F · Hàng dưới = cạnh D giáp B · Cột trái = giáp L · Cột phải = giáp R

> Frontend nên hiển thị hình minh họa/animation 3D hướng dẫn xoay đúng theo thứ tự trên cho từng bước chụp (F → R → B → L → U → D), không để người dùng tự đoán chiều.

---

### POST /detect/single-face
`multipart/form-data`.
**Request**: `face` = `"U"|"D"|"F"|"B"|"L"|"R"`, `image` = file (jpg/png, tối đa 5MB)

```json
{
  "success": true,
  "data": {
    "face_id": 101, "face": "U",
    "image_url": "http://localhost:8000/uploads/faces/101.jpg",
    "colors": ["white","red","green","white","white","blue","yellow","orange","white"],
    "confidence_score": 0.96
  }
}
```
`colors`: 9 phần tử, đọc trái→phải, trên→dưới theo đúng quy ước xoay ở phụ lục trên. Ngưỡng `LOW_CONFIDENCE`: `confidence_score < 0.7`.

**Lỗi riêng**
| error_code | Status |
|---|---|
| `INVALID_FACE` | 400 |
| `INVALID_FILE_TYPE` | 400 |
| `FILE_TOO_LARGE` | 400 |
| `CUBE_NOT_DETECTED` | 400 |
| `LOW_CONFIDENCE` | 400 — `details: {"confidence_score": 0.52}` |

---

### POST /detect/finalize
**Request**
```json
{
  "faces": [
    { "face": "U", "face_id": 101, "colors": null },
    { "face": "D", "face_id": 102, "colors": null },
    { "face": "F", "face_id": 103, "colors": ["white","red","green","white","white","blue","yellow","orange","white"] },
    { "face": "B", "face_id": 104, "colors": null },
    { "face": "L", "face_id": 105, "colors": null },
    { "face": "R", "face_id": 106, "colors": null }
  ]
}
```
`colors` khác `null` = người dùng sửa tay (confidence tính `1.0`). `colors = null` = giữ kết quả gốc của `face_id`.

```json
{
  "success": true,
  "data": {
    "rubik_state_id": 10,
    "cube_state": { "U": ["..."], "D": ["..."], "F": ["..."], "B": ["..."], "L": ["..."], "R": ["..."] },
    "confidence_score": 0.94
  }
}
```

**Lỗi riêng**
| error_code | Status | Mô tả |
|---|---|---|
| `FACE_NOT_FOUND` | 404 | `face_id` không tồn tại/không thuộc user hiện tại |
| `MISSING_FACE` | 400 | Thiếu 1 trong 6 mặt |
| `DUPLICATE_FACE` | 400 | 2 phần tử trong `faces` có cùng giá trị `face`, hoặc cùng `face_id` |
| `FACE_MISMATCH` | 400 | `face` khai báo trong request không khớp `face` gốc đã lưu của `face_id` đó |
| `INVALID_COLOR_ARRAY` | 400 | `colors` override không đủ/thừa 9 phần tử hoặc chứa màu không hợp lệ |
| `INVALID_CUBE_STATE` | 400 | Mỗi màu không đúng 9/54 ô — `details: {"invalid_colors": {"white": 11, "yellow": 7}}` |
| `UNSOLVABLE_STATE` | 400 | Hợp lệ số lượng màu nhưng sai vật lý |

---

## 6. SOLVER (yêu cầu đăng nhập)

### POST /solve
**Request**: `{ "rubik_state_id": 10 }`
Dùng `solving_method` từ Settings user hiện tại (chỉ hỗ trợ `KOCIEMBA`; mặc định `KOCIEMBA` nếu chưa có settings).

**Response 200** bình thường:
```json
{ "success": true, "data": { "solution_id": 5, "moves": ["R","U","R'","F2","U'","L","D2"], "total_steps": 7, "algorithm": "KOCIEMBA" } }
```
**Response 200** khối đã giải sẵn:
```json
{ "success": true, "data": { "solution_id": 6, "moves": [], "total_steps": 0, "algorithm": "KOCIEMBA" } }
```

**Lỗi riêng**: `RUBIK_STATE_NOT_FOUND` (404), `UNSOLVABLE_STATE` (400)

---

## 7. HISTORY & STATISTICS (yêu cầu đăng nhập)

### POST /history
**Request**:
```json
{ "solution_id": 5, "start_time": "2026-10-07T10:00:00+07:00", "end_time": "2026-10-07T10:01:35+07:00", "status": "completed" }
```
`status`: `completed` hoặc `abandoned`. `start_time` và `end_time` là chuỗi ISO 8601; mốc không có múi giờ được hiểu là UTC. `end_time` phải sau `start_time` (so sánh sau khi quy đổi UTC). `duration` luôn do backend tính bằng số giây nguyên `int(end_time - start_time)`, tức bỏ phần lẻ dương; bỏ qua nếu client gửi kèm. Không giới hạn số lần lưu cùng `solution_id`.

**Response 201**:
```json
{ "success": true, "data": { "id": 12, "solution_id": 5, "duration": 95, "status": "completed", "created_at": "2026-10-07T03:02:00Z" } }
```
`created_at` do server tạo, trả theo UTC (`Z`). Response không có `start_time`/`end_time`; dùng endpoint chi tiết để đọc hai mốc này.

**Lỗi riêng**: `SOLUTION_NOT_FOUND` (404), `INVALID_TIME_RANGE` (400)

### GET /history?page=1&limit=20
`page` mặc định 1, `limit` mặc định 20; cả hai là số nguyên ≥ 1. Giá trị không hợp lệ trả `VALIDATION_ERROR` (400). Chỉ lấy history của user hiện tại, gồm cả `completed` và `abandoned`. Sắp xếp mới nhất trước (`created_at DESC`, nếu trùng thì `id DESC`). `total` là tổng bản ghi trước phân trang.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "items": [
      { "id": 12, "solution_id": 5, "duration": 95, "status": "completed", "created_at": "2026-10-07T03:02:00Z", "total_steps": 4 }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```
Danh sách rỗng trả `items: []`, `total: 0` và vẫn giữ `page`/`limit` đã yêu cầu.

### GET /history/{id}
Chỉ đọc bản ghi của user hiện tại. **Response 200**:
```json
{
  "success": true,
  "data": {
    "id": 12,
    "status": "completed",
    "duration": 95,
    "start_time": "2026-10-07T03:00:00Z",
    "end_time": "2026-10-07T03:01:35Z",
    "created_at": "2026-10-07T03:02:00Z",
    "solution": { "id": 5, "moves": ["R", "U", "R'", "U'"], "total_steps": 4, "algorithm": "KOCIEMBA" },
    "rubik_state": {
      "id": 10,
      "cube_state": {
        "U": ["red", "green", "white", "white", "white", "white", "white", "white", "red"],
        "D": ["yellow", "yellow", "green", "yellow", "yellow", "yellow", "yellow", "yellow", "yellow"],
        "F": ["green", "green", "green", "green", "green", "white", "green", "green", "white"],
        "B": ["orange", "red", "blue", "blue", "blue", "blue", "blue", "blue", "blue"],
        "L": ["white", "orange", "orange", "orange", "orange", "orange", "orange", "orange", "orange"],
        "R": ["yellow", "blue", "blue", "red", "red", "red", "red", "red", "red"]
      },
      "face_images": {
        "U": "http://localhost:8000/uploads/faces/101.jpg",
        "D": "http://localhost:8000/uploads/faces/102.jpg",
        "F": "http://localhost:8000/uploads/faces/103.jpg",
        "B": "http://localhost:8000/uploads/faces/104.jpg",
        "L": "http://localhost:8000/uploads/faces/105.jpg",
        "R": "http://localhost:8000/uploads/faces/106.jpg"
      }
    }
  }
}
```
`cube_state` có đúng 6 mặt, mỗi mặt 9 màu. `face_images` ánh xạ mặt → URL ảnh gốc; có thể `{}` với trạng thái được lưu không kèm ảnh nguồn. Các thời gian trong response được chuẩn hóa về UTC (`Z`). Trạng thái mẫu ở trên giải được bằng `moves` mẫu.

**Lỗi riêng**: `HISTORY_NOT_FOUND` (404)

### GET /statistics
Chỉ tính trên history của user hiện tại có `status = "completed"`. `average_time` là trung bình `duration` (giây), `best_time` là `duration` nhỏ nhất, `average_steps` là trung bình `solution.total_steps`; hai giá trị trung bình là số thực hoặc `null`, không làm tròn ở API. `updated_at` là `created_at` lớn nhất trong các lượt `completed`, không phải thời điểm gọi API.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "total_solves": 2, "average_time": 107.5, "best_time": 95, "average_steps": 8.5,
    "progress": [
      { "date": "2026-09-20T08:00:00Z", "duration": 120 },
      { "date": "2026-10-07T03:02:00Z", "duration": 95 }
    ],
    "updated_at": "2026-10-07T03:02:00Z"
  }
}
```
`progress`: mỗi phần tử = **1 lượt giải hoàn thành** (không gộp theo ngày), `date` = `created_at` của bản ghi History đó. Chọn **50 bản ghi gần nhất** theo `created_at DESC, id DESC`, rồi trả theo thứ tự **cũ → mới** (`created_at ASC, id ASC`).

Chưa có lượt "completed" nào:
```json
{ "success": true, "data": { "total_solves": 0, "average_time": null, "best_time": null, "average_steps": null, "progress": [], "updated_at": null } }
```

---

## 8. PRACTICE (yêu cầu đăng nhập)

Lượt luyện tập dùng scramble ngẫu nhiên 20 ký hiệu do FE sinh. Mô hình 3D bắt đầu từ trạng thái đã giải, áp lần lượt 20 ký hiệu đó. Đồng hồ FE tính bằng `performance.now()`, làm tròn đến 0,01 giây rồi gửi `duration_cs` (số centisecond nguyên). Đây là thời gian người chơi tự bấm; backend không xác minh khối thật đã giải xong. Luyện tập độc lập với `/history` và không ảnh hưởng `/statistics`.

### POST /practice/attempts
**Request**:
```json
{ "scramble": ["R", "U2", "F'", "L", "D", "B2", "R'", "U", "F2", "L'", "D2", "B", "R2", "U'", "F", "L2", "D'", "B'", "R", "U2"], "duration_cs": 1234 }
```
`scramble` phải có đúng 20 ký hiệu thuộc `U D F B L R` với hậu tố rỗng, `'` hoặc `2` (chữ hoa); `duration_cs` là số nguyên từ 1 đến 360000 (1 giờ). Field thừa được bỏ qua theo mục 0. Giá trị sai trả `VALIDATION_ERROR` (400).

**Response 201**:
```json
{ "success": true, "data": { "id": 31, "scramble": ["R", "U2", "F'", "L", "D", "B2", "R'", "U", "F2", "L'", "D2", "B", "R2", "U'", "F", "L2", "D'", "B'", "R", "U2"], "duration_cs": 1234, "ao5_cs": null, "created_at": "2026-10-09T10:00:00Z" } }
```
`created_at` do server tạo, trả UTC (`Z`). `ao5_cs` là Ao5 của 5 lượt liên tiếp kết thúc ở lượt vừa lưu, hoặc `null` nếu chưa đủ 5.

### GET /practice/attempts?page=1&limit=20
Chỉ trả lượt của tài khoản hiện tại. `page` mặc định 1, `limit` mặc định 20; `page ≥ 1`, `1 ≤ limit ≤ 100`, sai trả `VALIDATION_ERROR` (400). Danh sách sắp theo `id DESC`. Ao5 lấy 5 lượt liên tiếp theo `id ASC`, bỏ thời gian nhanh nhất và chậm nhất, trung bình 3 lượt còn lại rồi làm tròn đến centisecond gần nhất. Không có DNF/+2 trong phiên bản này.

**Response 200**:
```json
{ "success": true, "data": { "items": [{ "id": 31, "scramble": ["R", "U2", "F'", "L", "D", "B2", "R'", "U", "F2", "L'", "D2", "B", "R2", "U'", "F", "L2", "D'", "B'", "R", "U2"], "duration_cs": 1234, "ao5_cs": 1290, "created_at": "2026-10-09T10:00:00Z" }], "total": 5, "page": 1, "limit": 20, "best_single_cs": 1100, "current_ao5_cs": 1290, "best_ao5_cs": 1290 } }
```
Chưa có lượt: `items: []`, `total: 0`, cả ba giá trị tốt nhất/hiện tại là `null`.

### GET /practice/leaderboard?limit=10
`limit` mặc định 10, từ 1 đến 100; sai trả `VALIDATION_ERROR` (400). Chỉ xếp tài khoản `active` có ít nhất một lượt (bảng single) hoặc ít nhất 5 lượt (bảng Ao5). Mỗi tài khoản xuất hiện tối đa một lần trong mỗi bảng. `single` sắp theo `best_single_cs ASC`, rồi `best_ao5_cs ASC` (null cuối), rồi `user_id ASC`; `ao5` sắp theo `best_ao5_cs ASC`, rồi `best_single_cs ASC`, rồi `user_id ASC`. Mỗi bảng cắt riêng theo `limit`; `rank` bắt đầu từ 1.

**Response 200**:
```json
{ "success": true, "data": { "single": [{ "rank": 1, "user_id": 7, "username": "cubist", "display_name": "Cubist", "duration_cs": 890, "total_attempts": 12 }], "ao5": [{ "rank": 1, "user_id": 7, "username": "cubist", "display_name": "Cubist", "duration_cs": 1100, "total_attempts": 12 }] } }
```
Hai bảng rỗng trả `single: []`, `ao5: []`.

---

## 9. KHỐI NHẬP MÀU BẰNG TAY (yêu cầu đăng nhập)

### POST /detect/manual
**Request**: `{ "cube_state": { "U": ["white", ...], "R": [...], "F": [...], "D": [...], "L": [...], "B": [...] } }`.

`cube_state` chứa đúng sáu mặt `U R F D L B`, mỗi mặt chín màu hợp lệ đọc theo hàng và hướng net ở mục 5. Tâm sáu mặt phải khác nhau; mỗi màu xuất hiện chín lần; trạng thái phải có thể giải được. Không cần ảnh hoặc `face_id`.

**Response 200**: cùng định dạng `/detect/finalize`: `{ "success": true, "data": { "rubik_state_id": 42, "cube_state": { ... }, "confidence_score": 1.0 } }`.

Lưu trạng thái thuộc người hiện tại rồi dùng `/solve` và `/history` như luồng quét. `confidence_score: 1.0` biểu thị màu do người dùng nhập, không phải độ chính xác nhận diện. Lịch sử của khối nhập tay trả `face_images: {}`.

| error_code | Status | Khi nào |
|---|---|---|
| `MISSING_FACE` | 400 | Thiếu mặt hoặc có tên mặt không thuộc sáu mặt quy định |
| `INVALID_COLOR_ARRAY` | 400 | Một mặt không có đúng chín màu hợp lệ |
| `INVALID_CUBE_STATE` | 400 | Số lượng màu sai (`details.invalid_colors` như finalize) hoặc các tâm trùng màu |
| `UNSOLVABLE_STATE` | 400 | Trạng thái không thể giải được |

Sai kiểu dữ liệu/thiếu `cube_state` trả `VALIDATION_ERROR` (400).

## 10. THỬ THÁCH MỖI NGÀY (yêu cầu đăng nhập)

Mỗi ngày theo giờ Việt Nam (UTC+7, đổi ngày lúc 00:00), server tạo và lưu duy nhất một scramble 20 ký hiệu chữ hoa. Không có hai bước liên tiếp cùng trục. Mọi người dùng nhận cùng scramble. Mỗi tài khoản có **một lượt chính thức/ngày**, độc lập với luyện tập, Ao5, History và Statistics. Thời gian do người chơi tự bấm; server không xác minh khối thật.

### GET /practice/daily-challenge
**Response 200**:
```json
{ "success": true, "data": { "id": 1, "date": "2026-10-11", "timezone": "Asia/Ho_Chi_Minh", "scramble": ["R", "U2", "F'", "L", "D", "B2", "R'", "U", "F2", "L'", "D2", "B", "R2", "U'", "F", "L2", "D'", "B'", "R", "U2"], "starts_at": "2026-10-10T17:00:00Z", "ends_at": "2026-10-11T17:00:00Z", "server_time": "2026-10-11T03:00:00Z", "my_attempt": null } }
```
`my_attempt` khi đã thi: `{ "id": 21, "duration_cs": 1234, "created_at": "2026-10-11T03:01:00Z" }`. Các mốc thời gian đều UTC (`Z`); FE dùng `server_time` và `ends_at` để tính thời gian còn lại, tránh phụ thuộc đồng hồ máy.

### POST /practice/daily-challenge/attempts
**Request**: `{ "challenge_id": 1, "duration_cs": 1234, "client_attempt_id": "4a655fe4-54a1-431d-b0cf-e49af19ba84c" }`.

`challenge_id` là số nguyên dương; `duration_cs` là số nguyên 1–360000; `client_attempt_id` là UUID do FE tạo một lần khi dừng đồng hồ, dùng lại khi thử lưu lại. Server lấy scramble đã lưu; không nhận scramble từ FE.

**Response 201** lần đầu, **200** khi thử lại cùng UUID và nội dung: `{ "success": true, "data": { "id": 21, "duration_cs": 1234, "created_at": "2026-10-11T03:01:00Z" } }`.

Thử lại đúng lượt đã lưu được phép sau khi ngày kết thúc; không sửa thời gian đã ghi. Unique constraint `(challenge_id, user_id)` bảo đảm chỉ một lượt kể cả request đồng thời.

| error_code | Status | Khi nào |
|---|---|---|
| `DAILY_CHALLENGE_NOT_FOUND` | 404 | Challenge không tồn tại |
| `DAILY_CHALLENGE_EXPIRED` | 400 | Ghi lượt mới ngoài ngày hiện tại; lượt qua 00:00 không được ghi sang ngày mới |
| `DAILY_ATTEMPT_EXISTS` | 409 | Đã có lượt chính thức, gửi UUID khác |
| `ATTEMPT_CONFLICT` | 409 | Dùng lại UUID nhưng đổi challenge hoặc thời gian |

### GET /practice/daily-challenge/leaderboard?challenge_id=1&limit=10
`challenge_id` tùy chọn (mặc định hôm nay), số nguyên dương; `limit` mặc định 10, từ 1 đến 100. Sai query trả `VALIDATION_ERROR` (400); challenge không tồn tại trả `DAILY_CHALLENGE_NOT_FOUND` (404).

**Response 200**:
```json
{ "success": true, "data": { "challenge_id": 1, "date": "2026-10-11", "items": [{ "rank": 1, "user_id": 7, "username": "cubist", "display_name": "Cubist", "duration_cs": 890, "created_at": "2026-10-11T03:01:00Z" }], "total_participants": 1, "my_rank": 1 } }
```
Chỉ xếp tài khoản `active`, theo `duration_cs ASC`, rồi `created_at ASC`, rồi `user_id ASC`; rank bắt đầu từ 1. `my_rank` là hạng người hiện tại trong toàn bảng (kể cả ngoài `limit`), hoặc `null` nếu chưa thi. Bảng trống: `items: []`, `total_participants: 0`, `my_rank: null`.

## 11. NGOÀI PHẠM VI v1
- Nhận diện từ video
- FE tự quản lý (không cần endpoint riêng): quyền camera; play/pause/next/prev của SolutionPlayer; fallback danh sách ký hiệu khi 3D lỗi; hủy sửa tay để phục hồi màu gốc (FE tự cache kết quả single-face, gửi lại `colors: null`)

---

## Ghi chú Frontend (fe/)
- Lưu `access_token` + `refresh_token`. Gặp `401` → thử `/auth/refresh` 1 lần → vẫn lỗi thì về `/login`.
- Đăng ký: `/auth/register/send-otp` → nhập mã → `/auth/register`; chỉ lưu token khi bước cuối thành công.
- Quên mật khẩu: 3 bước tuần tự `/auth/forgot-password` → `/auth/verify-otp` → `/auth/reset-password`.
- Luồng chụp: gọi `/detect/single-face` 6 lần riêng theo đúng **thứ tự và chiều xoay ở Phụ lục mục 5**, lưu 6 `face_id`, rồi gọi `/detect/finalize` 1 lần.
- Hiển thị hướng dẫn xoay khối (animation/hình minh họa) đúng theo phụ lục khi hướng dẫn người dùng chụp từng mặt — đây là điểm dễ gây lỗi `UNSOLVABLE_STATE` nếu hướng dẫn sai.

## Ghi chú Backend (be/)
- Field thừa trong mọi request → bỏ qua im lặng.
- Check quyền sở hữu resource ở mọi endpoint Detection/Solver/History/Statistics/Settings, trả `404` nếu không thuộc user hiện tại.
- Soft-delete: không xóa vật lý, chỉ đổi `status`.

---

## Lịch sử thay đổi
- **v5.6**: Thêm `/detect/manual` cho khối nhập màu không có ảnh; thử thách cùng scramble theo ngày Việt Nam, một lượt chính thức/tài khoản/ngày, lưu idempotent và bảng xếp hạng ngày riêng.
- **v5.5**: Cho phép lệch đồng hồ tối đa 120 giây khi xác minh thời gian ID token Google; từ chối issuer sai bằng `INVALID_GOOGLE_TOKEN`.
- **v5.4**: Thêm đăng nhập/đăng ký Google, liên kết Google sau khi đăng nhập bằng mật khẩu, và trạng thái `google_linked`/`has_password` trong hồ sơ.
- **v5.3**: Thêm lưu lượt luyện tập theo centisecond, Ao5, và hai bảng xếp hạng single/Ao5 tại `/practice`.
- **v5.2**: Thêm `/auth/register/send-otp`; `/auth/register` yêu cầu `otp_code`, chỉ tạo tài khoản và đăng nhập sau khi xác thực email.
- **v5.1 (chỉ tài liệu)**: Bổ sung status/body thành công của `PUT /users/me/password`, `DELETE /users/me`, `PUT /settings` theo backend hiện có; không đổi endpoint hoặc logic.
- **v5**: Chốt response/status của History, quy tắc thời gian và phân trang, định nghĩa chi tiết các trường Statistics; không thêm/đổi endpoint.
- **v4**: Chỉ hỗ trợ phương pháp giải `KOCIEMBA`; bỏ `CFOP` khỏi enum hợp lệ của Settings. Bản ghi Settings cũ có `CFOP` được chuyển sang `KOCIEMBA` khi migrate.
- **v3**: Chốt 10 điểm Codex nêu — xác nhận đăng ký tự đăng nhập ghi đè Use Case, sửa response lock/unlock, tách mã lỗi format vs thiếu field, hành vi token tài khoản đã xóa, lỗi trùng/lệch face ở finalize, phụ lục quy ước chụp 6 mặt chi tiết, deep-merge camera_config, quy tắc search/phân trang/include_deleted admin, định nghĩa progress thống kê, quy tắc bỏ qua field thừa toàn hệ thống.
- **v2**: Username, /auth/refresh, luồng quên mật khẩu 3 bước, face_id trong detect, `details` cho lỗi, yêu cầu đăng nhập Detection/Solver, thêm endpoint còn thiếu.
- **v1**: Bản khởi tạo.
