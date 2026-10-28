# CineBook runtime architecture

| File | Mục đích |
| --- | --- |
| `runtime.svg` | Ảnh tĩnh light theme để README và TECHNICAL hiển thị trực tiếp trên GitHub. |
| `runtime.html` | Archify standalone viewer: tải về và mở trong trình duyệt để xem tương tác, source references và export. |
| `runtime.json` | Đặc tả nguồn Archify, bao gồm repository revision và evidence. |
| `runtime.delivery.json` | Receipt provenance của HTML do Archify sinh. |

GitHub không thực thi HTML/JavaScript trong Markdown. Chưa cấu hình GitHub Pages; liên kết HTML trong tài liệu là liên kết tới file, không phải URL viewer được host.

## Cập nhật

1. Đối chiếu entrypoint, module registrations, I/O và deployment config với source. Cập nhật topology, ghi chú và `sources` trong `runtime.json`; cập nhật revision chỉ khi source evidence tồn tại tại commit đó.
2. Giữ `meta.output` là `docs/architecture/runtime.html`. Dùng Archify đã cài trên máy (thay `/path/to/archify` và đường dẫn Chromium):

   ```bash
   ARCHIFY_CHROME=/path/to/chromium node /path/to/archify/bin/archify.mjs finalize architecture \
     docs/architecture/runtime.json docs/architecture/runtime.html \
     --repo-root . --quality showcase --out-dir .archify/runtime-publish-check
   ```

3. Mở HTML, chờ font tải xong, chọn **Export → SVG · Light** và lưu đè `docs/architecture/runtime.svg`. Dùng export của viewer để giữ style/font và bỏ controls tương tác khỏi ảnh tĩnh; không lấy screenshot thay cho SVG.
4. Kiểm tra ảnh, liên kết trong README/TECHNICAL và kết quả validate/check/browser-check. Commit JSON, HTML, SVG và receipt cùng thay đổi tài liệu; giữ browser reports/ảnh kiểm tra cục bộ trong `.archify/`.

HTML và SVG được sinh từ cùng đặc tả; không chỉnh tay nội dung sơ đồ trong các file output. Viewer controls và nội dung sơ đồ dùng tiếng Anh để phù hợp với bản architecture reference.
