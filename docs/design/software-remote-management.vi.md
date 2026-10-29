# Quản lý phần mềm, profile và client remote

## Phần mềm trên máy host

Trong Admin → Apps on this PC, chọn **Choose software on this PC**. Trình duyệt thư mục đọc máy host, kể cả khi Admin mở từ máy khác. Chọn đúng file `.exe` trên Windows; tên được lấy từ tên file và icon được trích từ file chạy. Kiểm tra lại thông tin rồi bấm Add. Nếu file không có icon, có thể chọn ảnh thủ công.

Các vị trí khởi đầu gồm thư mục người dùng, Desktop, ổ đĩa, Program Files và thư mục Programs của người dùng. Có thể nhập đường dẫn thư mục và lọc tên. Không tải file chạy từ điện thoại lên host, không tự chạy phần mềm khi duyệt/chọn. Duyệt thư mục và đọc metadata cần quyền Admin và admin token cùng nguồn như các thao tác cấu hình app khác.

Các trường nhập tay, command/URI và ảnh tùy chọn nằm trong **App details / enter manually**. Đường dẫn chọn tự động được đặt trong dấu nháy kép; thay command bằng tay sẽ bỏ icon tự trích để tránh gắn icon của file cũ cho lệnh mới.

## Profile trong thẻ app

Mỗi app có các thẻ profile theo hai mode: Video + audio + controls và Gamepad only. Bấm tên profile để sửa đúng app, mode và profile; Xbox built-in xuất hiện khi chưa có profile riêng. Lưu trong editor cập nhật lại các thẻ. Nút All control profiles cho phép quản lý cả các app/host khác. Đã bỏ nút editor khỏi Settings.

## Client đang và đã remote

Admin → Remote clients gom client ghép đôi và khách còn lời mời chia sẻ. Bộ lọc gồm All clients, Remote now và Previously remote. Bảng hiển thị mode và thời điểm bắt đầu/kết thúc gần nhất. Trạng thái của các client khác nhau được theo dõi độc lập, không xóa cờ của client A khi B bắt đầu remote.

Đây là lần remote gần nhất trên mỗi client/lời mời, chưa phải nhật ký mọi lần kết nối. Dữ liệu trước cập nhật không thể khôi phục: client chưa có bản ghi được ghi rõ thay vì suy đoán từ thời điểm ghép đôi. Client ghép đôi giữ dữ liệu theo vòng đời session; khách giữ dữ liệu theo vòng đời lời mời. Khởi động lại không phục hồi cờ đang remote. Guest không có nút thu hồi session ghép đôi; quản lý lời mời vẫn qua bảng chia sẻ.

## Kiểm tra

- Backend Release build thành công.
- Bộ kiểm thử C++ bao gồm AuthManager và ShareManager: 17.766/17.766 kiểm tra qua.
- API smoke `.build-tools/software-api-smoke.py`: duyệt vị trí/thư mục, chọn chính xác file trong đường dẫn có khoảng trắng, `&`, `%`, tự lấy tên và icon, từ chối file không hợp lệ/đường dẫn tương đối/truy cập thiếu quyền.
- Fixture `frontend/test/fixtures/software-preview.html`: kiểm tra giao diện thật với dữ liệu mẫu, chọn file điền form và thẻ profile mở đúng mode trong trình duyệt.
- Chưa kiểm tra phiên remote thật trên điện thoại hoặc chơi game. Typecheck toàn repo có lỗi tồn tại ở các module khác.
