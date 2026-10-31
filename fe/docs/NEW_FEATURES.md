# Hai chức năng CubeMate mới

## Thử thách mỗi ngày — `/thu-thach`

Vào **Luyện tập → Thử thách mỗi ngày**. Tất cả tài khoản nhận cùng scramble 20 bước từ máy chủ; khối 3D cho thấy trạng thái sau khi xáo. Xáo khối thật trước, giữ Space để chuẩn bị, thả để bắt đầu, nhấn Space để kết thúc. Trên điện thoại dùng nút giữ và nút kết thúc.

Mỗi tài khoản có một kết quả chính thức/ngày. Ngày đổi lúc 00:00 giờ Việt Nam. Lượt kết thúc sau giờ này không được chuyển sang scramble ngày mới. Kết quả đã lưu được giữ nguyên khi thử gửi lại do mất mạng, kể cả sau 00:00. Bảng ngày có hạng của bạn và nút làm mới; thời gian do người chơi tự bấm. Thử thách không tính vào Ao5 luyện tập.

## Nhập màu khối — `/nhap-mau`

Vào **Quét → Nhập màu bằng tay**. Màu đã nhận diện được giữ lại khi chuyển từ Quét. Chọn mặt trong net, chọn màu, chạm từng ô lớn. Sáu tâm ban đầu là gợi ý và có thể sửa; các ô chưa tô là màu xám. Khối 3D cập nhật theo màu nhập. Có thể xoay lưới mặt 90° hoặc xóa màu với xác nhận.

Tô đủ 54 ô, mỗi màu chín ô, sáu tâm khác nhau rồi chọn **Lấy lời giải**. Backend kiểm tra tính khả thi của khối; frontend kiểm tra lời giải thực sự giải đúng khối trước khi mở trình phát. Lời giải của khối nhập tay hiển thị nguồn màu “Nhập bằng tay”; lịch sử không có ảnh nguồn.

## Kiểm tra nhanh

- Thử thách: giữ/thả/nhấn Space; sau khi lưu không thể ghi thêm lượt trong ngày; tải lại vẫn thấy kết quả. Kiểm tra bảng bằng tài khoản thứ hai.
- Nhập màu: thử gửi khi thiếu màu để thấy cảnh báo; thử khối thật xáo hợp lệ, xem mô hình và lấy lời giải. Có thể kiểm tra bằng khối đã giải (không có bước xoay).

## API và migration

API Contract v5.6 nằm ở `fe/docs/API_CONTRACT.md` (repository hiện chỉ có một bản). Các kiểu TypeScript được cập nhật cùng contract. Backend thêm migration `0008_daily_challenges`; trên database mới hoặc bản sao, chạy từ `be/`:

```powershell
.\.venv-clean\Scripts\python.exe -m alembic upgrade head
```

Chạy kiểm tra từ các thư mục tương ứng:

```powershell
# be/
.\.venv-clean\Scripts\python.exe -m pytest -q

# fe/
npm test
npm run build
```

Nếu Windows khóa file trong `fe/dist` khiến build lỗi EPERM, kiểm tra TypeScript và build ra thư mục mới:

```powershell
npx tsc -b
npx vite build --outDir dist-check-new
```
