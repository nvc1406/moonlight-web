# Profile theo game và gamepad cảm ứng

Tính năng mới dành cho **Windows native host**. Luồng stream và mapping tay cầm vật lý hiện tại được giữ nguyên; profile mới chỉ remap nguồn cảm ứng.

## Cách sử dụng

1. Trên máy chủ, mở **Settings → Game → Mode → Profile**. Chọn game, rồi chọn `Video + audio + gamepad` hoặc `Gamepad only`.
2. Tạo profile, chọn một nút trong preview để đổi nhãn, output, kích thước hoặc ẩn nút; kéo nút để đổi vị trí. Nút `landscape`/`portrait` chuyển layout đang chỉnh. `Test controls` chỉ kiểm tra output trong editor, không gửi input tới game.
3. Chỉnh deadzone, sensitivity, opacity và mặc định nghe âm thanh game. Dùng `Set default` cho từng mode, rồi **Save to host** để áp dụng. `Duplicate` sao chép trong mode; `Copy to other mode` tạo một bản độc lập. Xóa profile mặc định có bản thay thế sẽ yêu cầu chọn bản thay thế trước.
4. Mở game/stream như bình thường, rồi dùng link/QR mời điện thoại vào một slot có quyền gamepad. Trang tham gia cho chọn mode, nguồn cảm ứng/tay cầm vật lý, profile và nghe âm thanh game.
5. Trong phiên, mở **Controls** để hiện/ẩn gamepad, chọn profile, bật/tắt game audio, nghe voice và microphone. Khách có thể đổi giữa hai mode trong cùng slot; kết nối được tạo lại và người xem khác tiếp tục chạy.

`Video + audio + gamepad` hiển thị video cùng joystick và các nút trên một màn hình. `Gamepad only` không tạo pipeline capture/encode video, không lấy shared video feed, không tạo kênh/track video và không chờ frame đầu tiên. Âm thanh game mặc định bật ở mode video, tắt ở mode gamepad; profile có thể đổi mặc định này. Tắt nghe game trên điện thoại dừng capture audio cho kết nối đó.

Chủ phiên có nút **Select game** trong Controls để chọn game khi đang stream Desktop/Steam. Chọn từ các game đã cấu hình profile trên host đó. Các điện thoại nhận game mới nhưng giữ mode và lựa chọn profile riêng. Khi một app khác được mở từ MoonlightWeb, app mới quyết định profile tự động; lựa chọn Desktop/Steam cũ không ghi đè app mới.

Mỗi game/mode có danh sách và mặc định riêng. Trình duyệt nhớ profile được chọn theo host/game/mode. Khi profile bị xóa, thiết bị quay về mặc định; khi không có profile, dùng Xbox dựng sẵn. Thay đổi profile hoặc xoay màn hình nhả toàn bộ input trước khi dựng lại layout. Chuyển nền, mất focus và hủy touch cũng đưa các nút/trục về neutral. Các touch/mouse event trên gamepad không truyền tiếp thành thao tác trackpad.

## Voice chat

Voice là cuộc trò chuyện giữa các trình duyệt trong phiên: chủ phiên và tối đa ba khách, kể cả viewer. Mic không trở thành thiết bị microphone cho game hoặc Discord trên PC.

- Nghe voice mặc định bật; microphone luôn mặc định tắt và không được profile tự bật.
- Chỉ xin quyền khi người dùng bật mic. Tắt mic hoặc rời phiên dừng các track capture; kết quả xin quyền đến muộn cũng được giải phóng.
- Voice dùng WebRTC audio mesh; server chỉ chuyển signaling giữa các thành viên được xác thực trong cùng host session. Kết nối dùng cấu hình ICE/STUN/TURN mà transport nhận từ host. Mạng không kết nối được trực tiếp cần TURN được cấu hình.
- Lỗi voice/audio không dừng gamepad. `Retry voice` tạo lại kết nối voice. Trình duyệt chặn autoplay có thể cần người dùng bật lại nghe voice bằng một thao tác chạm.

## Dữ liệu và API

File `touch-profiles.json` nằm cạnh file settings đang sử dụng, kể cả khi chạy với `--config`. Ghi file nguyên tử bằng `QSaveFile`; revision ngăn editor cũ ghi đè thay đổi mới.

```text
version: 1
revision: số phiên bản lưu
games[]:
  host, appId, name
  modes.stream / modes.gamepad:
    defaultProfileId, profiles[]
```

Mỗi profile có `id`, `name`, `audio`, `deadzone`, `sensitivity`, `opacity` và `layouts.landscape/portrait`. Mỗi control có `id`, `label`, `output`, `x`, `y`, `size`, `hidden`; tọa độ là tỉ lệ, kích thước theo chiều rộng vùng điều khiển. Renderer giới hạn nút trong vùng an toàn. Output chỉ gồm nút/trục gamepad, không có bàn phím/chuột, macro hoặc combo.

| API | Quyền và hành vi |
| --- | --- |
| `GET/POST /api/touch/profiles` | Chủ host/admin; POST cần CSRF admin token như các thay đổi settings hiện có. Kiểm tra version, revision, mặc định và layout. |
| `GET /api/share/player/touch/session` | Chủ phiên có xác thực hoặc cookie của slot đang chạy; chỉ trả game/profile thuộc phiên. Client theo dõi revision bằng polling 1,5 giây. |
| `POST /api/share/player/touch/session` | Chủ host chọn `appId` cho phiên Desktop/Steam. |
| `POST /api/share/player/join` | Thêm `mode`, `profile_id`, `audio`; profile phải thuộc đúng game/mode. Thiếu mode giữ luồng stream cũ. Response có `mode`, `game_audio`. |
| `POST /api/share/player/touch/voice` | Đăng ký/poll/chuyển signaling/rời voice. Kiểm tra membership, activation, room, kích thước và tần suất; peer không hoạt động hết hạn sau 15 giây. |

Không thay đổi quyền viewer/gamer, giới hạn ba khách, PIN hoặc cơ chế thu hồi lời mời. Mỗi slot chỉ phát một nguồn cảm ứng hoặc tay cầm vật lý. Backend tiếp tục áp dụng input policy và watchdog.

## Kiểm chứng

- Build Release Windows bằng MSVC 2026 + Qt 6.11.2/Qt WebSockets thành công; Qt SDK được cài cục bộ trong `.build-tools/Qt`, không cài service hay thay bản production.
- Frontend **1.981/1.981 test qua** (189 file test). Có test cho mode/default/fallback, copy độc lập, editor, đa chạm, input neutralization, quyền viewer, transport không video, voice negotiation và giải phóng microphone. `npm run check` kiểm tra format, lint và i18n.
- Backend runner **17.513/17.513 check qua**; kiểm tra store/profile/default/revision/persistence cùng các regression hiện có; bộ test ICE riêng cũng chạy.
- Smoke test trên server `--dev` riêng: 14 tình huống API qua, gồm PIN binding, từ chối profile sai mode, tạo native controller-only session và đăng ký voice. Log khởi tạo ghi `video=false audio=false`; worker kết thúc bình thường, không gửi input trong smoke test.
- Đã kiểm tra browser ở viewport 390×844, sửa nhãn/output và lưu trong fixture UI, rồi xác nhận profile của mode còn lại độc lập. Fixture nằm ở `frontend/test/fixtures/touch-preview.html`, dùng component thật nhưng dữ liệu/frame giả và không thu microphone.
- Typecheck toàn repo còn lỗi có sẵn: so sánh với HEAD trước thay đổi là 189 lỗi, sau thay đổi không thêm loại lỗi mới. Không coi typecheck toàn repo là đã qua.

**Chưa kiểm chứng trên thiết bị thật:** Android Chrome/iPhone Safari, cảm giác joystick, hai điện thoại điều khiển hai người chơi, voice thu/phát thực tế và hành vi mạng di động/NAT. Test microphone hiện dùng mock; smoke native mới kiểm tra khởi tạo/rời phiên, chưa đo lưu lượng của một phiên chơi có PeerConnection kết nối hoàn chỉnh.

Chưa hỗ trợ tự phát hiện tiến trình game, mapping phím/chuột hoặc mode mới cho Sunshine/Apollo/Linux/macOS.
