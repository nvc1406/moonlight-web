# Phân quyền Admin / Client

- Trang đăng nhập PIN có lựa chọn **Client** hoặc **Admin**. Hai PIN độc lập và dùng một lần; nhập PIN client ở chế độ admin không cấp quyền quản trị.
- Mở **Admin → Client access** để tạo/xóa PIN admin và chọn app được phép cho client theo từng host. PIN client nằm ở mục **Client login PIN** ngay bên dưới.
- Mặc định danh sách cho phép rỗng: client không thấy host/app nào. Tick app rồi bấm **Save client app access**. Cấu hình lưu trong `client_apps` của settings.json.
- Admin thấy toàn bộ app, màn hình vật lý/virtual và các trang quản trị. Client chỉ thấy app được cấp phép; không thêm/xóa/pair host, quản lý backend/seat/driver, sửa danh sách app, profile dùng chung hay setting server.
- Settings của client giữ các lựa chọn stream, giải mã/hiển thị, âm thanh, bàn phím/chuột/tay cầm và ngôn ngữ được lưu trên trình duyệt. Client không ghi mặc định streaming chung của server.
- Backend kiểm tra quyền ở API, lọc danh sách app/host và từ chối mở app hoặc lấy ảnh app ngoài danh sách. Cache danh sách app cũ của admin không được dùng trên phiên client.
- Thay đổi quyền áp dụng cho yêu cầu danh sách và lượt mở app tiếp theo; không tự ngắt stream đang chạy. Client chỉ kết thúc stream do chính phiên đó sở hữu, không dùng được thao tác Stop session toàn host.
- PIN admin mặc định chỉ đăng nhập qua LAN; Internet theo tùy chọn remote admin Internet hiện có. PIN admin hết hiệu lực sau khi dùng hoặc restart server. Chứng chỉ đăng nhập tạo phiên client.
- Localhost và host key tiếp tục là lối quản trị của chủ máy để thiết lập/cấp PIN.

## Test admin và client trên cùng máy

1. Mở admin tại `https://localhost:48443/admin` (thay cổng nếu cấu hình khác).
2. Trong phần cấp quyền client, bấm **Test client** để mở tab mới, hoặc vào `https://localhost:48443/client-test/`. IP LAN cũng dùng được, ví dụ `https://172.16.8.64:48443/client-test/`.
3. Tab test yêu cầu đăng nhập bằng **Client PIN** và tên tài khoản nếu admin đã tạo tài khoản. Dùng tab admin để tạo PIN, cấp app rồi quay lại tab test đăng nhập.
4. Banner xác nhận chế độ test. Client chỉ thấy host/app được cấp quyền; danh sách rỗng nếu chưa cấp app. Đăng xuất qua Settings để thử tài khoản khác. **Mở admin** trên banner mở tab quản trị riêng.

Server dùng namespace `/client-test/api/*` và `/client-test/ws*`, bỏ đặc quyền IP máy chủ/host session/admin session, chặn nâng quyền bằng PIN admin, mật khẩu và host key. Cookie `mw_test_client_session` có Path `/client-test/`, tách khỏi `mw_session` của admin; đăng nhập/đăng xuất test không thay cookie admin. Chuyển trang và refresh giữ namespace test. Các tab test cùng trình duyệt và cùng địa chỉ chia sẻ phiên test; dùng profile trình duyệt riêng để thử nhiều tài khoản client đồng thời. Các cài đặt localStorage (ngôn ngữ, lựa chọn stream) vẫn dùng chung theo địa chỉ như trước.

Sau khi cập nhật backend cần khởi động lại server để đường dẫn test hoạt động. Link test chỉ dùng bản backend đã cập nhật; chỉ chép frontend vào bản server cũ không đủ.

Kiểm tra: build backend Release; bộ test frontend; unit test AuthManager về PIN/phạm vi app; smoke HTTP `.build-tools/Smoke-Access.ps1` dùng server và config thử nghiệm riêng. Không thay thế việc thử stream thực tế trên điện thoại/gamepad.
