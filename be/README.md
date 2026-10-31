# Rubik Recognition and Solver Backend

Backend độc lập cho ứng dụng nhận diện và hướng dẫn giải khối Rubik. Dự án dùng Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic và MySQL 8. Môi trường phát triển hiện tại cũng đã được xác nhận chạy với MariaDB 10.4 trong XAMPP.

## Yêu cầu

- Python 3.11
- MySQL 8 hoặc MariaDB 10.4/XAMPP đang chạy
- `pip`
- Trên Windows, gói `kociemba==1.2.1` cần Microsoft C++ Build Tools để biên dịch native extension khi cài từ PyPI.

## Cài đặt

Tạo virtual environment:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Cài dependency:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Tạo file cấu hình môi trường:

```powershell
Copy-Item .env.example .env
```

Cập nhật `DATABASE_URL`, `JWT_SECRET` và thông tin SMTP trong `.env`. Với Gmail dùng `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` là địa chỉ Gmail đầy đủ và `SMTP_PASSWORD` là mật khẩu ứng dụng. File `.env` được Git bỏ qua. Nếu toàn bộ SMTP để trống, service email log OTP ra console cho môi trường phát triển; cấu hình dở dang sẽ trả `EMAIL_SEND_FAILED`.

Tạo database MySQL trước khi chạy migration, ví dụ:

```sql
CREATE DATABASE rubik_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Chạy migration:

```powershell
alembic upgrade head
```

Migration `0004_utc_created_at` chuẩn hóa các `created_at` cũ do MySQL/MariaDB sinh theo múi giờ máy chủ; mọi kết nối ứng dụng mới đặt session DB ở UTC để timestamp JSON có hậu tố `Z` đúng nghĩa. Migration không đổi `start_time`, `end_time` hoặc thời hạn token.

Migration `0005_registration_otps` tạo bảng mã xác nhận email đăng ký. Luồng đăng ký gọi `/auth/register/send-otp`, sau đó `/auth/register` với `otp_code`. Tài khoản chỉ được tạo khi mã đúng.

Migration `0006_practice_attempts` tạo bảng lượt luyện tập độc lập với lịch sử giải từ camera; cần chạy `alembic upgrade head` sau khi cập nhật mã để trang Luyện tập hoạt động.

Migration `0007_google_sign_in` thêm định danh Google duy nhất và cho phép tài khoản tạo bằng Google không có mật khẩu. Để bật đăng nhập Google, tạo OAuth Client ID loại **Web application** trong Google Cloud Console, thêm cả `http://localhost` và `http://localhost:5173` vào **Authorized JavaScript origins** (không có đường dẫn `/register`), điền cùng Client ID vào `GOOGLE_CLIENT_ID` trong `be/.env` và `VITE_GOOGLE_CLIENT_ID` trong `fe/.env.local`, rồi khởi động lại cả hai dev server. Nút Google dùng JavaScript callback nên không cần redirect URI hay Client Secret. Nếu ứng dụng Google ở chế độ Testing, thêm tài khoản muốn thử vào Test users. Backend xác minh ID token của Google trước khi cấp JWT nội bộ.

Migration `0008_daily_challenges` thêm hai bảng `daily_challenges` và `daily_challenge_attempts`. Chạy `alembic upgrade head` để bật Thử thách mỗi ngày. Migration chỉ thêm bảng và index, không sửa dữ liệu lịch sử hoặc lượt luyện tập hiện có.

Kiểm tra kết nối MySQL:

```powershell
python -c "from sqlalchemy import text; from app.db.session import engine; c=engine.connect(); print(c.execute(text('SELECT 1')).scalar()); c.close()"
```

## Chạy ứng dụng

```powershell
uvicorn app.main:app --reload
```

Nếu dùng môi trường `.venv-clean` đã cài Kociemba native trên máy hiện tại, có thể chạy trực tiếp (không phụ thuộc venv đang được activate):

```powershell
.\.venv-clean\Scripts\python.exe -m uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Kiểm thử

```powershell
pytest
```

Test hiện bao phủ smoke test `/health`, Auth, User, Settings, Admin, Detection, Solver, History, Statistics, Practice, nhập màu bằng tay, Thử thách mỗi ngày và format lỗi chung. Không còn endpoint contract nào trả placeholder `501`. Test OpenAPI đối chiếu các endpoint của API Contract v5.6. Test dùng database SQLite riêng; test migration `0008` và request đồng thời cũng dùng database tạm, không truy cập database MySQL hiện hành.

## Danh sách endpoint

Tất cả response nghiệp vụ dùng `{ "success": true, "data": ... }`; lỗi dùng `{ "success": false, "error_code": ..., "message": ... }` và chỉ kèm `details` khi cần.

| Nhóm | Method | Path |
|---|---|---|
| System | GET | `/health` |
| Auth | POST | `/auth/register` |
| Auth | POST | `/auth/register/send-otp` |
| Auth | POST | `/auth/login` |
| Auth | POST | `/auth/refresh` |
| Auth | POST | `/auth/logout` |
| Auth | POST | `/auth/forgot-password` |
| Auth | POST | `/auth/verify-otp` |
| Auth | POST | `/auth/reset-password` |
| User | GET | `/users/me` |
| User | PUT | `/users/me` |
| User | PUT | `/users/me/password` |
| User | DELETE | `/users/me` |
| Settings | GET | `/settings` |
| Settings | PUT | `/settings` |
| Settings | POST | `/settings/reset` |
| Admin | GET | `/admin/users` |
| Admin | PUT | `/admin/users/{user_id}/lock` |
| Admin | PUT | `/admin/users/{user_id}/unlock` |
| Admin | DELETE | `/admin/users/{user_id}` |
| Detection | POST | `/detect/single-face` |
| Detection | POST | `/detect/finalize` |
| Detection | POST | `/detect/manual` |
| Solver | POST | `/solve` |
| History | POST | `/history` |
| History | GET | `/history` |
| History | GET | `/history/{history_id}` |
| Statistics | GET | `/statistics` |
| Practice | POST | `/practice/attempts` |
| Practice | GET | `/practice/attempts` |
| Practice | GET | `/practice/leaderboard` |
| Practice | GET | `/practice/daily-challenge` |
| Practice | POST | `/practice/daily-challenge/attempts` |
| Practice | GET | `/practice/daily-challenge/leaderboard` |

Swagger UI: `http://localhost:8000/docs`. `DELETE /users/me` và `DELETE /admin/users/{user_id}` là soft-delete, đồng thời thu hồi refresh token.

## History và Statistics (API Contract v5.1)

Các endpoint này yêu cầu Bearer token và chỉ truy cập dữ liệu của tài khoản hiện tại. `POST /history` nhận `solution_id`, `start_time`, `end_time` (chuỗi ISO 8601) và `status` (`completed` hoặc `abandoned`), trả **201** với `data: {id, solution_id, duration, status, created_at}`. Backend tự tính `duration = int(end_time - start_time)` theo giây sau khi quy đổi UTC, bỏ phần lẻ; thời gian không kèm múi giờ được hiểu là UTC. `end_time` phải sau `start_time`. Có thể lưu nhiều lượt cho cùng một lời giải.

`GET /history?page=1&limit=20` trả **200** với `data: {items, total, page, limit}`. Mỗi item có `id`, `solution_id`, `duration`, `status`, `created_at`, `total_steps`. `page`/`limit` là số nguyên từ 1; danh sách gồm cả lượt `completed` lẫn `abandoned`, sắp xếp `created_at DESC, id DESC`. `GET /history/{id}` trả **200** với `id`, `status`, `duration`, `start_time`, `end_time`, `created_at`, `solution: {id, moves, total_steps, algorithm}` và `rubik_state: {id, cube_state, face_images}`. `face_images` ánh xạ mặt Rubik sang URL ảnh gốc, có thể rỗng khi không lưu ảnh nguồn. Thời gian trong response là UTC (`Z`).

`GET /statistics` chỉ tính lượt `completed`. Response **200** có `total_solves`, `average_time` (giây, số thực hoặc `null`), `best_time` (giây nguyên hoặc `null`), `average_steps` (số thực hoặc `null`), `progress` và `updated_at` (UTC hoặc `null`). `progress` lấy tối đa 50 lượt mới nhất rồi trả theo thứ tự cũ → mới; `date` của từng điểm là `history.created_at`. `updated_at` là `created_at` của lượt hoàn thành gần nhất. Chưa có lượt hoàn thành thì các trung bình, `best_time`, `updated_at` là `null`, `total_solves = 0` và `progress = []`. Xem API Contract v5.1 để biết JSON mẫu và mã lỗi chính xác.

## Luyện tập (API Contract v5.3)

Trang `/luyen-tap` gửi scramble 20 ký hiệu và thời gian tính theo centisecond tới `POST /practice/attempts`. `GET /practice/attempts` trả lượt và thống kê của tài khoản hiện tại. `GET /practice/leaderboard` trả hai bảng riêng: một lượt nhanh nhất và Ao5 tốt nhất của mỗi tài khoản đang hoạt động. Ao5 lấy 5 lượt liên tiếp, bỏ nhanh nhất và chậm nhất, trung bình 3 lượt còn lại. Đây là thời gian do người chơi tự bấm; backend không kiểm tra trạng thái khối thật. Ba endpoint này yêu cầu đăng nhập.

## Nhập màu bằng tay và Thử thách mỗi ngày (API Contract v5.6)

`POST /detect/manual` nhận `cube_state` gồm sáu mặt chín màu theo hướng net trong contract. Backend kiểm tra số lượng màu, tâm khác nhau và khả năng giải trước khi lưu `RubikState` thuộc tài khoản hiện tại với `confidence_score: 1.0`. Giá trị này biểu thị màu do người dùng nhập. Không tạo ảnh hoặc `RubikFace` giả; tiếp tục gọi `/solve`, `/history` như luồng camera và lịch sử trả `face_images: {}`.

`GET /practice/daily-challenge` tạo hoặc lấy scramble 20 bước chung của ngày Việt Nam (UTC+7, đổi ngày lúc 00:00), kèm `server_time`, `starts_at`, `ends_at` UTC và lượt chính thức của người hiện tại nếu có. Mỗi tài khoản chỉ có một lượt chính thức/ngày. `POST /practice/daily-challenge/attempts` nhận `challenge_id`, `duration_cs`, `client_attempt_id` (UUID); trả 201 khi lưu mới, 200 nếu thử lại cùng UUID và nội dung. UUID đã lưu vẫn có thể thử lại sau khi hết ngày; UUID đổi nội dung trả `ATTEMPT_CONFLICT`, UUID mới khi đã thi trả `DAILY_ATTEMPT_EXISTS`. Unique constraint bảo vệ cả request đồng thời.

`GET /practice/daily-challenge/leaderboard` mặc định hôm nay, hoặc nhận `challenge_id` để xem ngày trước. Chỉ xếp tài khoản đang hoạt động theo thời gian, thời điểm lưu, rồi user ID; `my_rank` tính trong toàn bảng dù ngoài `limit`. Thử thách độc lập với luyện tập/Ao5, History và Statistics. Ba endpoint yêu cầu đăng nhập; thời gian vẫn do người chơi tự bấm.

## Chạy thử luồng HTTP end-to-end

Mở Uvicorn với `.env` trỏ tới database XAMPP đã migrate, rồi chạy ở terminal khác:

```powershell
.\.venv-clean\Scripts\python.exe scripts\e2e_requests.py --image-dir datasets\personal_cube --personal-cube --rotate-to-valid
```

Script dùng `requests` đi qua HTTP thật: health → register → login → upload 6 ảnh → detect → finalize → solve → POST/GET history → GET statistics. Script tạo tài khoản test ngẫu nhiên rồi soft-delete sau khi kiểm tra; history vẫn còn trong DB. Dùng `--keep-account` nếu muốn giữ tài khoản hoạt động. Sáu ảnh cá nhân hiện có không cùng chiều chụp theo phụ lục contract: finalize nguyên kết quả trả `UNSOLVABLE_STATE`. Tùy chọn `--rotate-to-valid` chỉ xoay lưới 3×3 màu đã nhận diện trong **script kiểm thử**, rồi gửi bằng `colors` override được contract cho phép; backend không tự xoay ảnh hay đổi API. Lần thử thành công trên sáu ảnh này cho lời giải 19 bước, history 95 giây và một điểm thống kê. Nếu dùng bộ ảnh tổng hợp `test_images/`, một số ảnh có thể trả `LOW_CONFIDENCE` đúng ngưỡng 0,7.

## Giải Rubik

`POST /solve` nhận `rubik_state_id` thuộc người dùng hiện tại, kiểm tra trạng thái 54 ô có thể giải, chuyển sang định dạng URFDLB và dùng Kociemba. Kết quả được lưu ở bảng `solutions`; trạng thái đã giải trả `moves: []`, `total_steps: 0`. Cache bộ nhớ tối đa 4096 trạng thái giúp những lần giải lặp lại không gọi lại thuật toán. `solving_method` hiện chỉ chấp nhận `KOCIEMBA`; migration `0003_kociemba_only` đổi các cấu hình CFOP cũ sang KOCIEMBA.

Đã cài và kiểm tra bản Kociemba native trong `.venv-clean` trên Windows. Trạng thái xáo 12 bước mẫu mất **0,019 giây** khi giải lần đầu và **0,0001 giây** khi lấy từ cache; bản Python fallback trước đó mất khoảng 1,47 giây cho cùng trạng thái. Test yêu cầu dưới 1 giây cho các trạng thái mẫu khi native extension có mặt. Đây là phép đo trên máy hiện tại, không phải cam kết thời gian cho mọi khối/máy; hãy đo lại trên môi trường triển khai. Nếu cài từ PyPI trên Windows, cần MSVC Build Tools và Windows SDK. Bản `kociemba==1.2.1` cũ còn dùng build dependency `pytest-runner`; môi trường này cài native từ source gốc đã tải sẵn nhưng bỏ riêng yêu cầu build-time đó, không sửa thuật toán.

## Nhận diện ảnh thật bằng YOLOv8

`/detect/single-face` dùng hai checkpoint: `models/face_best.pt` tìm mặt Rubik trong ảnh gốc, rồi `models/best.pt` tìm và phân loại 9 ô màu trên mặt đã cắt. Model màu dùng test-time augmentation khi suy luận; điều này tăng độ bền với biến thể ảnh nhưng cũng tăng thời gian xử lý. Kết quả `colors` theo thứ tự trái→phải, trên→dưới; `confidence_score` là confidence thấp nhất của 9 ô sau hiệu chỉnh. Khi YOLO nhầm ô cam rất sáng thành vàng, bước kiểm tra HSV **chỉ ở vùng giữa ô đã được YOLO tìm thấy** sửa lại cam; màu cam/đỏ rất sáng có bằng chứng màu rõ cũng được nâng confidence tối thiểu lên 0,75. Đây không phải fallback không cần model: thiếu checkpoint vẫn trả `500 INTERNAL_ERROR`. Nếu không tìm đủ ô sẽ trả `400 CUBE_NOT_DETECTED`, và dưới ngưỡng 0,7 trả `400 LOW_CONFIDENCE`. Request/response của `/detect/single-face` và `/detect/finalize` không đổi. `color_classification.py` và `grid_detection.py` cũ còn để kiểm tra offline, không dùng trong API chính.

Hai bản export đã dùng là [LazyCube v17](https://universe.roboflow.com/lazycube/lazycube/dataset/17) (`D:\LazyCube.v17-pre-demo.yolov8`, gồm nhãn mặt + màu) và [Rubik's Cube Colors crop-only v5](https://universe.roboflow.com/yumi-k2bdp/rubik-s-cube-colors-crop-only/dataset/5) (`D:\Rubik-s Cube - Colors - crop only.v5i.yolov8`, gồm nhãn màu). Các README đi kèm ghi giấy phép CC BY 4.0; giữ nguồn và ghi công nếu phát hành dữ liệu hay model. Bộ crop-only dùng lại ảnh gốc từ LazyCube, nên script **tách theo tên ảnh nguồn chung**, không tách ngẫu nhiên theo file `.rf.<hash>`. Nếu không sẽ có ảnh gần trùng ở train và test. Chỉ tập train được tăng cường; augmentation màu không đổi hue/saturation.

Để tái tạo dữ liệu ở một thư mục đầu ra còn trống:

```powershell
python -m scripts.import_roboflow --lazycube 'D:\LazyCube.v17-pre-demo.yolov8' --yumi 'D:\Rubik-s Cube - Colors - crop only.v5i.yolov8' --output datasets/roboflow_new
python -m scripts.prepare_face_dataset --lazycube 'D:\LazyCube.v17-pre-demo.yolov8' --color-manifest datasets/roboflow_new/source_manifest.csv --output datasets/face_new
```

Script chỉ nhận mặt có đủ chín nhãn vào bộ màu, quy đổi class ID đúng API (`0=white`, `1=yellow`, `2=red`, `3=orange`, `4=blue`, `5=green`) và lưu `source_manifest.csv` để kiểm tra tách nguồn. Dataset đang dùng trong workspace là `datasets/roboflow_multivariant` (1.081 crop train từ 193 nhóm ảnh nguồn), `datasets/roboflow_clean_fixed` (giữ phân nhóm/ảnh đánh giá gốc) và `datasets/face_detector_processed`. Tùy chọn `--all-train-variants` chỉ thêm ảnh từ nhóm nguồn train; ảnh val/test không bị đưa vào train. Các bản export gốc ở `D:\` không bị sửa.

Huấn luyện bằng Python 3.11 (CPU được, GPU sẽ nhanh hơn):

```powershell
python scripts/train.py --data datasets/roboflow_new/data.yaml --epochs 20 --imgsz 384 --batch 8 --output models/best.pt
python scripts/train.py --data datasets/face_new/data.yaml --epochs 15 --imgsz 384 --batch 8 --allow-hsv --run-name rubik_face --output models/face_best.pt
python -m scripts.evaluate_color_model --data datasets/roboflow_new --model models/best.pt --split test
python -m scripts.evaluate_pipeline --manifest datasets/roboflow_new/source_manifest.csv --face-model models/face_best.pt --color-model models/best.pt --split test
```

Để tái tạo lượt cải thiện hiện tại từ checkpoint màu cũ đã sao lưu:

```powershell
python -m scripts.import_roboflow --lazycube 'D:\LazyCube.v17-pre-demo.yolov8' --yumi 'D:\Rubik-s Cube - Colors - crop only.v5i.yolov8' --output datasets/roboflow_multivariant_rebuild --split-manifest datasets/roboflow_clean_fixed/source_manifest.csv --augmentations-per-image 0 --all-train-variants
python -m scripts.train --data datasets/roboflow_multivariant_rebuild/data.yaml --weights models/best_pre_multivariant.pt --epochs 10 --imgsz 384 --batch 8 --device cpu --run-name rubik_multivariant_rebuild --output models/multivariant_rebuild.pt
```

Không dùng `--allow-hsv` khi train model **màu** vì thay đổi hue có thể làm sai nhãn. `--allow-hsv` chỉ dành cho model tìm mặt. Test trên ảnh mặt đã cắt và test pipeline trên ảnh gốc là hai phép đo khác nhau; hãy đánh giá cả hai trước khi dùng với camera của chính bạn. Mô hình hiện học từ một nguồn ảnh công khai tương đối nhỏ, nên ảnh camera/ánh sáng/loại Rubik khác nguồn có thể kém chính xác. Người dùng có thể chỉnh `colors` khi `/detect/finalize` nếu nhận diện sai.

Checkpoint hiện có trong `models/best.pt` và `models/face_best.pt` đã được kiểm tra trên **41 ảnh đại diện thuộc nhóm nguồn test**, không xuất hiện trong tập train. Pipeline tìm đúng mặt và đủ 9 ô ở 41/41 ảnh; 39/41 vượt ngưỡng confidence 0,7; 34/41 đúng cả 9 màu; 33/41 vừa đúng cả 9 màu vừa vượt ngưỡng. Độ chính xác theo ô trên tập này là 98,10%. Đây là kết quả trên bộ ảnh công khai, **không** phải cam kết chính xác với mọi camera hoặc khối Rubik mới. Model màu cũ được giữ tại `models/best_pre_multivariant.pt` để có thể khôi phục. Có thể chạy lại phép đo:

```powershell
python -m scripts.evaluate_pipeline --manifest datasets/roboflow_clean_fixed/source_manifest.csv --face-model models/face_best.pt --color-model models/best.pt --split test
```

Đã đánh giá mở rộng trên **mọi biến thể Roboflow** của các nhóm nguồn chưa dùng để train (ảnh cùng nguồn được gom theo tên trước `.rf.`). Tập test có 181 biến thể từ **41 ảnh nguồn độc lập**: tìm thấy mặt ở 174 ảnh, IoU với nhãn mặt ≥ 0,5 ở 169 ảnh; 137 ảnh có thể đối chiếu đủ 9 ô theo tọa độ nhãn, trong đó **114 ảnh đúng trọn 9 màu** và **111 ảnh vừa đúng vừa vượt ngưỡng confidence 0,7**; độ chính xác theo ô là 96,27%. Trước cải thiện, các số tương ứng là 107/137 và 96/137. Tập validation có 203 biến thể từ **42 ảnh nguồn khác**: 200 ảnh tìm thấy mặt và đạt IoU ≥ 0,5; 160 ảnh đối chiếu được đủ 9 ô, **136 ảnh đúng trọn 9 màu**, **131 ảnh vừa đúng vừa vượt ngưỡng**; độ chính xác theo ô là 97,36%. Trước cải thiện, các số tương ứng là 126/160 và 113/160. Những biến thể cùng nguồn không phải ảnh độc lập; tập validation đã được dùng để chọn checkpoint nên không phải phép thử cuối hoàn toàn độc lập. Cả hai checkpoint có cùng phân nhóm nguồn train/val/test. Các ảnh không đối chiếu được 9 ô không được tính vào mẫu số độ chính xác màu.

Chạy lại phép đo mở rộng (đổi đường dẫn export nếu cần):

```powershell
python -m scripts.evaluate_pipeline --manifest datasets/roboflow_clean_fixed/source_manifest.csv --face-model models/face_best.pt --color-model models/best.pt --split test --lazycube-root "D:\LazyCube.v17-pre-demo.yolov8" --all-source-variants
python -m scripts.evaluate_pipeline --manifest datasets/roboflow_clean_fixed/source_manifest.csv --face-model models/face_best.pt --color-model models/best.pt --split val --lazycube-root "D:\LazyCube.v17-pre-demo.yolov8" --all-source-variants
```

Sáu ảnh khối Rubik cá nhân hiện được giữ cục bộ ở `datasets/personal_cube/` (đã bỏ qua bởi Git), kèm 54 nhãn màu được đối chiếu bằng mắt. Sau hiệu chỉnh, cả 6/6 ảnh được nhận đúng 9 ô và đều vượt ngưỡng API; kiểm thử HTTP thật có trong `tests/test_detection.py`. Có thể chạy lại:

```powershell
python -m scripts.evaluate_personal_cube --color-model models/best.pt
```

Đây **không phải** đánh giá độc lập cho camera cá nhân vì chính sáu ảnh đó đã giúp chọn quy tắc hiệu chỉnh. Một checkpoint YOLO fine-tune thử nghiệm được giữ riêng tại `models/personal_candidate.pt`, nhưng không thay `models/best.pt` vì kết quả trên tập test cũ kém hơn. Sáu ảnh hiện tại cũng chưa theo đúng chiều chụp từng mặt trong Phụ lục 5 của API Contract; nhận diện đủ màu không đồng nghĩa `/detect/finalize` sẽ chấp nhận trạng thái Rubik nếu gửi nguyên chiều ảnh. Cần chụp đúng quy ước hoặc xoay ảnh trước khi gửi; backend không tự đổi hướng mặt.

## Thử pipeline nhận diện ảnh

`test_images/` chứa sáu ảnh mặt Rubik **tổng hợp** (`U.png`, `D.png`, `F.png`, `B.png`, `L.png`, `R.png`) để kiểm tra pipeline OpenCV/HSV cũ theo cách độc lập; script này **không** kiểm thử YOLO và **không** đại diện độ chính xác camera thật:

```powershell
python scripts/check_detection.py
```

Muốn tạo lại ảnh tổng hợp:

```powershell
python scripts/check_detection.py --generate-samples
```

Có thể thay bằng ảnh JPG/PNG thật theo đúng quy ước chụp trong API Contract. Ảnh phải đặt tên theo mặt (`U.jpg`, `D.png`, v.v.) rồi chạy `python scripts/check_detection.py --directory duong_dan_anh`. Ngưỡng tin cậy API là 0,7. Nhánh YOLO thực tế qua API cần **cả hai** checkpoint `models/face_best.pt` và `models/best.pt`; script `check_detection.py` không thay thế cho bài test này.

## Cấu trúc chính

```text
app/
  core/       Cấu hình, JWT, hashing, lỗi chung
  db/         SQLAlchemy engine, session, declarative base
  models/     SQLAlchemy models
  schemas/    Pydantic request/response schemas
  routers/    FastAPI routers theo nhóm API
  services/   Business logic tách khỏi router
alembic/      Migration scripts
scripts/      Chuẩn bị dữ liệu, train, đánh giá và kiểm thử HTTP end-to-end
models/       Checkpoint nhận diện; API cần best.pt và face_best.pt
test_images/  Sáu ảnh tổng hợp làm fixture cho test
datasets/     Dữ liệu huấn luyện và sáu ảnh thật (chỉ giữ cục bộ)
runs/         Kết quả/biểu đồ train để đối chiếu báo cáo (chỉ giữ cục bộ)
uploads/      Avatar và ảnh sáu mặt Rubik
tests/        Pytest tests
.env.example  Mẫu cấu hình, không chứa bí mật thật
requirements.txt  Dependency Python
```

Migration ban đầu tạo tám bảng nghiệp vụ được yêu cầu và bảng liên kết nội bộ `rubik_state_faces`, dùng để giữ quan hệ giữa trạng thái hoàn chỉnh và sáu ảnh gốc phục vụ `GET /history/{id}`.

Khi nộp hoặc đưa mã nguồn lên Git, không đưa `.env`, môi trường ảo, ảnh cá nhân, upload người dùng, dataset đã xử lý, cache và log. `.gitignore` hiện cũng bỏ qua mọi `models/*.pt`: nếu bàn giao nguồn qua Git, cần cung cấp riêng `models/best.pt` và `models/face_best.pt` (hoặc chủ động thay chính sách Git cho đúng hai file này), nếu không API nhận diện sẽ thiếu checkpoint. `datasets/personal_cube/` là dữ liệu ảnh thật cục bộ; không đưa vào gói nộp công khai khi chưa có chủ ý chia sẻ.
