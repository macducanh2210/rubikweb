# Quy tắc thiết kế giao diện: Ứng dụng Rubik

File này là quy tắc luôn áp dụng cho mọi việc liên quan giao diện trong `fe/`. Đọc hết trước khi viết bất kỳ dòng UI nào.

## Bối cảnh

- Sản phẩm: quét 6 mặt khối Rubik bằng camera, nhận diện màu, giải và hướng dẫn từng bước bằng mô hình 3D.
- Người dùng: sinh viên và người chơi Rubik, chủ yếu dùng điện thoại vì phải dùng camera. Thiết kế mobile-first (390px) rồi mới mở rộng lên desktop.
- Việc chính của giao diện: dẫn người dùng chụp đúng 6 mặt, rồi theo dõi lời giải. Đăng nhập, cài đặt, admin phải gọn và yên tĩnh, không tranh sự chú ý với phần lõi.

## Ngôn ngữ thị giác: nhãn dán Rubik

Điểm nhấn duy nhất của cả app là chính khối Rubik: lưới 3x3 ô màu, net 6 mặt, khối 3D. Mọi thứ xung quanh phải trung tính và im lặng để khối Rubik nổi lên.

### Màu nhãn dán (dùng theo vai trò, không dùng để trang trí)

| Màu | Hex | Vai trò trong giao diện |
|---|---|---|
| Xanh dương | `#0046AD` | Hành động chính: nút chính, liên kết, mục đang chọn |
| Xanh lá | `#009B48` | Thành công, hoàn thành |
| Đỏ | `#B71234` | Lỗi, thao tác nguy hiểm (khóa, xóa) |
| Cam | `#FF5800` | Cảnh báo, ví dụ độ tin cậy nhận diện thấp |
| Vàng | `#FFD500` | Đánh dấu bước hiện tại trong lời giải |
| Trắng | `#F5F5F0` | Màu ô trắng của khối; luôn kèm viền 1px để không chìm vào nền sáng |

Khi hiển thị ô màu của khối Rubik (net, 3D, ảnh minh họa), dùng đúng 6 hex trên để màu nhận diện và màu hiển thị khớp nhau.

### Nền trung tính (dùng CSS variables, hỗ trợ cả hai chế độ)

Người dùng chọn `light` hoặc `dark` trong Cài đặt (theo API contract), nên mọi màu phải đi qua biến, không hardcode trong component.

| Biến | Light | Dark |
|---|---|---|
| nền trang | `#EDEEF0` | `#121316` |
| bề mặt | `#FFFFFF` | `#1B1D21` |
| chữ chính | `#15161A` | `#ECEDEF` |
| chữ phụ | `#5B5F69` | `#9A9EA8` |
| đường kẻ | `#D4D6DB` | `#2C2F35` |

### Hình khối

- Bo góc theo thứ bậc, không dùng một giá trị cho mọi thứ: ô nhãn dán 3px, nút và ô nhập 6px, panel lớn 10px. Không dùng `rounded-2xl` hoặc `rounded-3xl`.
- Phân tách bằng đường kẻ và khoảng trắng. Hạn chế bọc từng nhóm nội dung trong thẻ bo góc.
- Bóng đổ chỉ dành cho thứ thật sự nổi lên (modal, dropdown). Không đặt cùng một bóng xám dưới mọi khối.

## Chữ

- Một họ chữ cho toàn giao diện: **Be Vietnam Pro** (thiết kế cho tiếng Việt, đủ dấu), cài qua `@fontsource`, weight 400, 500, 600, 700.
- Ký hiệu xoay (`R U R' F2`), đồng hồ bấm giờ và số liệu thống kê dùng font mono có số cùng độ rộng (JetBrains Mono hoặc IBM Plex Mono). Chỉ dùng cho những chỗ này, không dùng mono để trang trí nhãn nhỏ.
- Thang cỡ chữ cố định: 12, 14, 16, 20, 28, 40 px. Line-height 1.5 cho nội dung, 1.2 cho tiêu đề. Độ dài dòng dưới 70 ký tự.
- Toàn bộ chữ viết kiểu câu (chỉ hoa chữ đầu câu).
- Sau khi cài font, kiểm tra hiển thị đủ dấu: ă â ê ô ơ ư đ và các dấu thanh.

## Bố cục

- **Điều hướng**: mobile dùng thanh tab dưới (Quét, Lời giải, Lịch sử, Tài khoản); desktop từ 1024px dùng thanh bên trái gọn. Mục Quản trị chỉ xuất hiện với admin.
- **Màn hình Quét**: khung camera chiếm phần lớn, lưới hướng dẫn 3x3 phủ lên trên. Bên dưới là dải net 6 mặt làm chỉ báo tiến độ: mặt đã chụp hiện đúng 9 màu vừa nhận diện, mặt đang chụp có viền nổi, mặt chưa chụp để trống màu xám nhạt. Kèm hình minh họa nhỏ cách xoay khối cho mặt kế tiếp, theo Phụ lục quy ước chụp trong API_CONTRACT. Không dùng stepper số 1-2-3 ở đây vì net đã là chỉ báo.
- **Màn hình kết quả nhận diện**: net 6 mặt cỡ lớn, bấm vào ô để đổi màu bằng bộ chọn 6 ô màu, hiển thị độ tin cậy, cảnh báo màu cam khi thấp.
- **Màn hình Lời giải**: khối 3D chiếm phần lớn. Bên dưới là dãy ô vuông, mỗi ô một ký hiệu (font mono): bước hiện tại nền vàng, bước đã qua mờ đi. Điều khiển phát, tạm dừng, trước, sau và tốc độ nằm dưới dãy này.
- **Lịch sử**: danh sách hàng dày (ngày, số bước, thời gian bằng font mono, trạng thái), không dùng thẻ. **Thống kê**: số liệu lớn kèm biểu đồ đường một màu xanh dương, không tô gradient.
- **Đăng nhập và đăng ký**: từ 768px chia đôi màn hình, bên trái là hình khối Rubik hoặc lưới 3x3 trộn màu cỡ lớn (SVG tĩnh, dùng đúng bảng màu), bên phải là form căn trái. Mobile: logo nhỏ và form. Không dùng thẻ kính mờ nằm giữa màn hình.
- **Căn lề**: nội dung căn trái. Chỉ căn giữa cho trạng thái rỗng và gợi ý trên camera.

## Chuyển động

- Chỉ dùng chuyển động để phản hồi thao tác: đổi màu ô, chuyển bước lời giải, animation xoay 3D, ô trong net lật vào khi chụp xong một mặt.
- Không fade-in hay trượt lên cho từng section, không phóng to khi hover thẻ.
- Tôn trọng `prefers-reduced-motion`.

## Tuyệt đối không dùng

Đây là các dấu hiệu quen thuộc của giao diện do AI sinh ra:

- Kính mờ: `backdrop-blur`, nền `bg-white/5`, viền `border-white/10`.
- Nền gradient, chữ gradient, gradient tím-xanh, quầng sáng hoặc đốm màu mờ làm nền.
- Inter, Roboto hoặc font hệ thống mặc định.
- Emoji làm icon, và icon trong mọi nút. Chỉ dùng icon khi nó giúp nhận biết thật sự (camera, xoay, phát). Một bộ icon duy nhất (lucide-react), nét 1.75, cỡ 20px.
- `rounded-2xl` cho mọi thứ; cùng một bóng xám dưới mọi thẻ.
- Nhãn IN HOA giãn chữ phía trên tiêu đề; dấu `→` ở cuối nút; chuỗi nối bằng dấu chấm giữa kiểu `A · B · C`.
- Đánh số 01, 02, 03 khi nội dung không phải chuỗi bước. Riêng 6 mặt cần chụp là chuỗi thật nên được dùng.
- Tô màu hoặc in nghiêng riêng một từ trong tiêu đề.
- Chữ giữ chỗ như "Form đăng nhập sẽ được xây dựng ở đây" hoặc lorem ipsum.

## Nội dung chữ (tiếng Việt)

- Giản dị, dùng động từ chủ động, câu ngắn. Nút nói đúng việc sẽ xảy ra: "Chụp mặt tiếp theo", "Chụp lại mặt này", "Lưu kết quả", "Bắt đầu giải". Tránh "Gửi", "Xác nhận" chung chung.
- Một hành động giữ một tên xuyên suốt: nút "Lưu thay đổi" thì thông báo là "Đã lưu thay đổi".
- Lỗi nói rõ chuyện gì xảy ra và cách sửa, ưu tiên `message` từ API. Không xin lỗi dài dòng. Ví dụ: "Chưa thấy khối Rubik trong ảnh. Đặt khối vào giữa khung rồi chụp lại."
- Trạng thái rỗng là lời mời hành động: "Chưa có lượt giải nào. Quét một khối Rubik để bắt đầu."
- Không dùng câu quảng cáo như "Trải nghiệm tuyệt vời" hay "Chào mừng bạn đến với...".

## Chất lượng tối thiểu

- Responsive từ 360px. Vùng chạm tối thiểu 44px.
- Focus bàn phím nhìn thấy được. Tương phản chữ đạt WCAG AA ở cả light và dark.
- Mọi màn hình gọi API đều có trạng thái đang tải, lỗi và rỗng.

## Quy trình cho mỗi màn hình

1. Viết kế hoạch ngắn: wireframe ASCII, token sẽ dùng, thành phần tái sử dụng.
2. Tự đối chiếu kế hoạch với danh sách "Tuyệt đối không dùng". Chỗ nào là lựa chọn mặc định bạn sẽ làm cho bất kỳ app nào, sửa lại và nói rõ đã đổi gì.
3. Code bằng các primitive trong `src/components/ui` (Button, Field, Sticker, CubeNet, MoveChip, StatRow, EmptyState, Spinner). Không viết lại style lặp ở từng trang.
4. Chụp màn hình ở 390px và 1280px, tự phê bình, bỏ bớt một thứ trang trí rồi mới báo hoàn thành.
