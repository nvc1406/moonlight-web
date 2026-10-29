# Tài khoản client

Trong **Admin → Client access → Client accounts**, tạo sẵn tên tài khoản (không phân biệt hoa/thường, tối đa 64 ký tự). Tên trùng bị từ chối. Mỗi tài khoản có ID riêng, không dùng tên thiết bị làm thông tin xác thực.

Lần đầu, người dùng chọn Client, nhập tên tài khoản và Client PIN do admin cấp, giữ lựa chọn Remember me. PIN vẫn dùng một lần: admin tạo PIN mới cho lượt ghép thiết bị tiếp theo. Các lần mở lại trên cùng trình duyệt dùng cookie HttpOnly đã lưu để vào thư viện game và kết nối như hiện tại, không cần nhập PIN.

Phiên được nhớ trong 90 ngày không hoạt động, lưu qua lần khởi động lại server. Trình duyệt khác, xóa cookie, đăng xuất hoặc phiên hết hạn cần nhập PIN lại. Bỏ Remember me tạo phiên tạm như trước. Shortcut iPhone được tạo qua cơ chế handoff kế thừa ID tài khoản.

**Revoke devices** thu hồi toàn bộ phiên của tài khoản, lần truy cập tiếp theo phải nhập PIN lại. **Delete account** xóa tài khoản và thu hồi các phiên đó. Tạo lại cùng tên nhận ID mới nên cookie cũ không được phục hồi. Các thao tác này không tự dừng worker stream đang chạy.

Các tài khoản cùng sử dụng danh sách app được admin cho phép trong Client access; chưa có quyền game riêng theo tài khoản. Khi danh sách tài khoản rỗng, luồng PIN cũ vẫn được hỗ trợ. Các phiên đã ghép trước khi bật quản lý tài khoản vẫn tồn tại; có thể thu hồi trong danh sách Sessions. Khi đã tạo tài khoản, đăng nhập client mới phải dùng tên hợp lệ và PIN, không dùng chứng chỉ thay thế. Admin giữ luồng đăng nhập riêng.

Kiểm chứng ngày 29/10/2026: build backend Release thành công; 17.782/17.782 kiểm tra backend qua, gồm khôi phục phiên tài khoản từ đĩa và kế thừa ID qua handoff. Smoke HTTP `.build-tools/Smoke-Accounts.ps1` qua cho tạo/trùng tên, đăng nhập tên + PIN, cookie quay lại, chặn API admin, thu hồi, xóa/tạo lại cùng tên. Frontend 2.000/2.002 test qua; hai test lỗi thuộc `HostListEmptyInvite.test.js`. Test tài khoản/đăng nhập tập trung, lint các module thay đổi và i18n đều qua. Typecheck toàn dự án vẫn có lỗi ở các phần khác. Chưa thử đăng nhập/stream trên điện thoại thật, chưa cập nhật gói portable.
