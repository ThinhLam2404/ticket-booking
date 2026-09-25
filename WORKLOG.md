# Worklog — 2026-09-17

## Trạng thái

Đã hoàn thiện batch xử lý các finding về cinema seed tĩnh, layout ghế Couple, pricing showtime và UI admin/booking. Chưa commit.

## Đã làm

- Seed cinema tĩnh từ `be/prisma/data/cinemas.seed.json`, không gọi mạng lúc runtime hoặc seed.
- Seed upsert cinema/room, sinh layout ghế bằng `buildSeatLayout()` và bảo vệ dữ liệu showtime/booking hiện có.
- Cleanup seed cũ theo namespace static IDs; chỉ xóa cinema/room không còn showtime liên quan.
- Showtime update chỉ repricing khi giá hoặc room thay đổi; chỉ đổi lịch/phim giữ nguyên `ShowtimeSeat.price`.
- DTO pricing giữ multiplier optional trong OpenAPI và generated frontend types.
- Layout hợp lệ yêu cầu hàng liên tục từ A, tối thiểu 5 hàng, ba hàng đầu Standard, hàng giữa VIP và hàng cuối Couple chẵn.
- Seat CRUD chặn Couple đơn lẻ và chặn sửa layout hoàn chỉnh ngoài bulk layout.
- Booking canonicalize Couple thành hai ghế vật lý và giới hạn tối đa 10 ghế vật lý.
- Booking UI chọn cả cặp Couple, hiển thị legend/nhãn trạng thái và loại bỏ cặp không còn khả dụng sau refresh.
- Admin UI quản lý Couple qua bulk layout, không còn mở form CRUD đơn lẻ cho Couple.
- Cập nhật README và generated OpenAPI artifacts.

## Verification đã pass

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`: 32/32
- `npm run test:e2e`: 6/6
- `npm run test:integration`: 9/9
- `npm run api:check`
- `git diff --check`
- Prisma schema validation và migration deploy trên PostgreSQL integration
- Focused layout, seats, showtimes, bookings và error-filter regression tests: 20/20

## Sprint 0 đã hoàn tất

- Error response giữ domain `code` ổn định, có `VALIDATION_FAILED`, và frontend dịch theo code với fallback tiếng Việt.
- Idempotent hold retry được kiểm tra trước trạng thái movie/showtime hiện tại.
- PATCH seat công bố đầy đủ lỗi `409` trong OpenAPI.
- Province picker hỗ trợ tìm không dấu/codename, reset search khi đóng, dùng lỗi API thật và không kéo giãn option khi ít kết quả.
- Mobile province picker có fallback `100vh` và hỗ trợ `100dvh`.
- Migration index dùng `DROP INDEX IF EXISTS`; migration chain đã deploy sạch trên integration database.

## Sprint 3 — Tích hợp SePay QR & Webhook — ĐÃ HOÀN TẤT

- Chuẩn hóa hold policy: > 15 phút hold 10 phút; > 5 đến 15 phút hold 2 phút; <= 5 phút chặn tạo booking mới để giữ buffer.
- Migration database: bảng `SepayPaymentIntent` (paymentCode unique, expectedAmount, expiresAt) và `SepayTransaction` (sepayId unique, transferAmount, status MATCHED / REVIEW_REQUIRED / CONFIRMED / REFUNDED).
- `SepayService`:
  - `checkout()`: tạo hoặc reuse intent với VietQR compact QR URL và mã thanh toán `CB...`.
  - `handleWebhook()`: xác thực API key, bỏ qua giao dịch ra hoặc trùng id, khớp mã và số tiền, xác nhận booking và phát hành vé; nếu lỗi/hết hạn chuyển `REVIEW_REQUIRED` để hoàn tiền thủ công.
  - `findTransactions()` và `updateTransactionStatus()` cho Admin.
- `SepayWebhookGuard`: xác thực `Authorization: Apikey <KEY>`.
- Frontend `BookingPages.tsx`: hiển thị QR SePay, thông tin ngân hàng, nút copy nội dung CK, countdown hết hạn và polling kiểm tra trạng thái tự động chuyển sang trang vé khi thành công.
- Admin UI `AdminPaymentsPage`: xem danh sách giao dịch SePay, lọc theo trạng thái và đánh dấu đã hoàn tiền thủ công.
- Unit tests: 6 test cases cho `SepayService` (checkout tạo intent, reuse intent, webhook bỏ qua transferType khác, bỏ qua trùng id, xử lý thiếu mã và sai số tiền sang REVIEW_REQUIRED).
- Cập nhật README, generated OpenAPI và types.

## Roadmap các sprint

### Sprint 0 — Nền tảng correctness/error/test — ĐÃ HOÀN TẤT

- Chuẩn hóa domain error codes và `VALIDATION_FAILED`.
- Frontend dịch lỗi theo `code`, fallback tiếng Việt, không hiển thị raw network error.
- Sửa idempotent hold retry sau khi showtime/movie thay đổi trạng thái.
- Bổ sung OpenAPI `409` cho PATCH seat.
- Fix province picker: tìm không dấu/codename, reset search, lỗi API thật, layout ít kết quả và mobile viewport.
- Deploy migration chain trên PostgreSQL integration và bổ sung regression tests.

### Sprint 1 — Hold, expiry và payment correctness — ĐANG THỰC HIỆN

- ĐÃ LÀM: Back/“Thay đổi ghế” xác nhận, cancel/release hold thành công rồi mới điều hướng.
- ĐÃ LÀM: Cancel idempotent: `PENDING -> CANCELLED`; retry trên `CANCELLED/EXPIRED` trả kết quả hiện tại; `CONFIRMED` trả conflict.
- ĐÃ LÀM: Chính sách server giữ ghế 10 phút khi suất còn hơn 15 phút, 2 phút khi còn từ 5 đến 15 phút, và chặn hold mới khi còn tối đa 5 phút.
- ĐÃ LÀM: Couple được canonicalize khi hold; seat read và payment transaction tự normalize DB hold đã hết hạn.
- ĐÃ LÀM: Countdown/progress checkout dùng thời gian còn lại; xóa timer giả `09:59` trên seat map.
- ĐÃ LÀM: Integration coverage cho cancel idempotency và boundary suất chiếu quá gần.
- ĐÃ LÀM: Browser verification desktop/mobile cho hold, checkout, countdown và điều hướng Back/cancel.
- Không còn áp dụng payload hash payment cũ sau khi loại bỏ mock payment; duplicate/concurrent SePay webhook đã có coverage riêng.

### Sprint 2 — Admin showtime và bulk scheduling — ĐANG THỰC HIỆN

- ĐÃ LÀM: Chỉ cho admin chọn movie `PUBLISHED` khi tạo/sửa suất chiếu.
- ĐÃ LÀM: `datetime-local` được serialize theo giờ Việt Nam `Asia/Ho_Chi_Minh` với offset `+07:00`.
- ĐÃ LÀM: Backend tự tính `endsAt = startsAt + movie.duration`; UI hiển thị kết thúc read-only.
- ĐÃ LÀM: Khi đổi start/movie thì tính lại end; chỉ đổi pricing giữ end hiện tại.
- ĐÃ LÀM: Thêm bulk preview và bulk commit cho nhiều suất cùng movie/room.
- ĐÃ LÀM: Sinh slot tuần tự theo `firstStartsAt`, `duration`, `turnaroundMinutes`; không dùng random.
- ĐÃ LÀM: Commit bulk atomic với Serializable transaction; overlap rollback toàn batch.
- ĐÃ LÀM: Exclusion/transaction overlap trả `409 SHOWTIME_OVERLAP`.
- ĐÃ LÀM: Unit coverage timezone/duration/preview và integration coverage bulk/rollback.
- ĐÃ LÀM: Integration coverage hai bulk request đồng thời; một request commit, request còn lại nhận `409 SHOWTIME_OVERLAP`.
- ĐÃ LÀM: Browser verification admin bulk desktop/mobile cho free slots, conflict preview và modal không tràn ngang.

### Sprint 3 — TMDB import nhiều phim và trailer (ĐÃ HOÀN TẤT)

- ĐÃ LÀM: Tạo Stitch reference desktop `989cd32409cb42ff9f480572762407ba` và mobile `396a64b32fae4fe48574a6779ca1b88e` theo CineNoir Violet; Inspo study dùng hướng component-playground/dark technical.
- ĐÃ LÀM: Sau import patch mọi cache có prefix `tmdb-movies`; row đổi ngay thành `Đã nhập`, sau đó invalidate catalog.
- ĐÃ LÀM: Pending state theo từng `tmdbId`, modal giữ mở sau import và chặn đóng khi queue còn chạy.
- ĐÃ LÀM: Pagination tối đa 20 trang, checkbox chọn xuyên trang, giới hạn chính xác 20 phim mỗi batch.
- ĐÃ LÀM: Bounded queue concurrency chính xác 3, partial success và retry riêng item lỗi.
- ĐÃ LÀM: TMDB detail lấy tiếng Việt trước; nếu chưa có video phù hợp mới fallback video tiếng Anh; ưu tiên ngôn ngữ rồi official Trailer, Trailer, Teaser.
- ĐÃ LÀM: `PUT /movies/admin/tmdb/:tmdbId/resync` chỉ cập nhật poster/backdrop/trailer có giá trị mới, giữ nguyên trường biên tập và status.
- ĐÃ LÀM: Trailer modal có loading, timeout/error, retry remount và link mở trực tiếp trên YouTube.
- ĐÃ LÀM: Thêm Vitest helper coverage cho concurrency, partial failure, giới hạn 20 và cache synchronization.
- ĐÃ LÀM: Full verification — lint, typecheck, build, 56 backend unit, 3 frontend helper tests, 6 e2e, 13 integration, API check và diff check đều pass.
- ĐÃ LÀM: Browser kiểm tra modal ở viewport 375px; layout search/bulk/row/pagination không tràn ngang. Flow API live cần đăng nhập lại Admin vì phiên browser hiện trả `401`.

### Sprint 4 — UX polish, browser verification và vận hành

- Hoàn thiện toàn bộ thông báo lỗi admin bằng tiếng Việt.
- Bổ sung request ID ở vùng hỗ trợ, không hiển thị làm lỗi chính.
- ĐÃ LÀM: Browser verification desktop và viewport `<= 720px` cho hold/back, checkout, countdown và admin bulk scheduling.
- ĐÃ LÀM: Chạy đầy đủ lint, typecheck, build, unit, e2e, integration, API generation/check.
- ĐÃ LÀM: Seed hai lần trên database development; counts giữ nguyên `3,16,50,50,3218,19,1396`, fixed movie/showtime IDs vẫn mỗi loại 1 bản ghi.
- ĐÃ LÀM: Cập nhật README, OpenAPI, generated frontend types và WORKLOG.

## Việc còn lại

## 2026-09-21 — Loại bỏ legacy PaymentsService/mock payment

- Xóa `PaymentsModule`, `PaymentsController`, `PaymentsService` và mock DTO; production chỉ còn checkout/webhook SePay.
- Giữ bảng `Payment` vì SePay vẫn tạo `provider: SEPAY`, nhưng xóa `Payment.idempotencyKey` và unique index bằng migration `20260921110000_remove_mock_payment_idempotency`.
- Cancel/expire booking cập nhật `SepayPaymentIntent` sang `CANCELLED`/`EXPIRED`.
- Webhook SePay xử lý race duplicate theo unique `sepayId`; integration coverage chuyển từ mock payment sang matched, duplicate/concurrent và review-required webhook.
- Đã pass lint, typecheck, build, unit `52/52`, E2E `6/6`, integration `12/12`, `api:check`.

## 2026-09-21 — Webhook SePay vẫn 400 do test delivery dùng `id: 0`

- Log `SePay webhook payload rejected` cho thấy bản "Gửi thử" của SePay dùng `"id": 0` giả, rớt `@Min(1)` trong DTO.
- Bỏ `@Min(1)`, giữ `@IsInt()` (giao dịch thật luôn id ≥ 1; bản test sai số tài khoản nên cũng không lưu DB).
- Thêm unit test payload test (`id: 0`) → 201; verify HTTP thật với đúng payload SePay → 201.
- Tổng unit hiện tại: 52/52 pass.

## 2026-09-21 — Sửa webhook SePay 400 do field `code`

- Nguyên nhân: global `ValidationPipe` bật `forbidNonWhitelisted`, payload thật của SePay có field `code` chưa khai báo trong DTO nên mọi webhook (kể cả Gửi thử) đều 400.
- Webhook giờ bypass pipe toàn cục (body dạng record) và tự validate lenient trong `SepayService`: strip field lạ, chỉ 400 khi thiếu/sai field bắt buộc; thêm `code` optional, `content` optional, `@IsNumber()` cho `transferAmount`.
- Thêm 2 unit test (payload đủ field SePay + field lạ vẫn 201; thiếu field bắt buộc thì 400); đã verify qua HTTP thật: payload mẫu SePay → 201, gửi trùng → 201 idempotent, sai key → 401.
- Đồng bộ README.

- Hoàn tất payment payload hash/race hardening và test cạnh tranh chuyên sâu.
- Browser verification desktop và viewport `<= 720px` cho hold/back, checkout, countdown và admin bulk scheduling.
- Test concurrency hai bulk scheduling request đồng thời.
- Chạy seed hai lần trên database development và kiểm tra counts/idempotency nếu cần môi trường dữ liệu thật.

## 2026-09-21 — Đồng bộ integration spec với payment flow hiện tại

- Chuẩn hóa coverage checkout theo route `/api/v1/payments/bookings/:id/checkout`.
- Thay toàn bộ coverage mock bằng checkout/webhook SePay, nên không còn endpoint mock trong integration flow.
- Thay assertion mã lỗi cũ `PURCHASE_REQUIRED` bằng `SHOWTIME_TOO_CLOSE` cho suất còn dưới 5 phút.
- Lint, typecheck, build, unit `52/52`, E2E `6/6`, integration `12/12` và `api:check` pass sau đợt dọn mock.

## 2026-09-21 — Sửa bulk conflict tiếng Việt, guard rời trang thanh toán, CSS nút payment, giờ vận hành 08:00–23:00 và gợi ý khung trống

- Bulk preview trả `reasonCode` (`SHOWTIME_OVERLAP`/`SHOWTIME_OUTSIDE_HOURS`) và `conflicts[]` kèm giờ suất đang chiếm thay cho chuỗi tiếng Anh cứng; frontend render `Trùng với suất 14:00 – 16:10, 18:20 – 20:30` (ngăn cách dấu phẩy, khác ngày thì prefix ngày).
- Thêm CSS `.bulk-preview*` (trước đó chưa có nên các suất dính sát nhau).
- Trang thanh toán: guard khi booking còn `PENDING` — nút Back trình duyệt, click link rời trang và đóng tab (`pagehide` + `fetch keepalive`) đều hỏi xác nhận rồi tự gọi cancel nhả ghế; redirect vé khi `CONFIRMED` không bị chặn. Cancel API vốn idempotent nên gọi thừa an toàn.
- Sửa toàn bộ nút dùng class không tồn tại (`btn-primary`/`btn-secondary`/`btn-full`/`btn-sm`) sang `.primary`/`.secondary` đúng design system; thêm utility `.btn-full`, `.btn-sm` và `.summary-actions`.
- Quy tắc giờ vận hành: suất chiếu chỉ được bắt đầu 08:00–23:00 hằng ngày (giờ VN), suất 23:00 được chấp nhận; áp dụng cho create/update/previewBulk/createBulk với code mới `SHOWTIME_OUTSIDE_HOURS`.
- Endpoint admin mới `GET /showtimes/rooms/:roomId/free-slots` gợi ý khung trống trong `[08:00 → 23:00]` sau khi trừ suất bận và turnaround hai đầu; UI bulk modal và form lẻ có nút xem khung trống, chip khung trống và hint cảnh báo ngoài giờ.
- Cố định giờ VN trong unit/integration spec bulk (`10:00 VN`) để không flaky theo giờ chạy; thêm 7 unit test mới (giờ vận hành, conflicts, free slots).
- Đồng bộ README, OpenAPI và generated frontend types.

## 2026-09-22 — Ghi chú tiếp tục plan redesign FE light/dark

- Mục tiêu tiếp theo: làm UI CineBook bắt mắt hơn và hỗ trợ chuyển giữa `light` / `dark` mode.
- Hướng reference đã chọn: Admin theo Elastic Cloud + Highlight Explore + Hex; User theo Standard Hotels + M+ Museum. Admin ưu tiên dashboard/table/filter rõ ràng; User ưu tiên cinematic/editorial, hình ảnh lớn, catalogue và CTA đặt vé rõ.
- Đã dùng Inspo để khảo sát các reference: `elastic-co--cloud`, `highlight-xyz--explore-trending`, `hex-tech`, `standardhotels-com`, `mplus-org-hk`, `palaisdetokyo-com--tarifs`.
- Khi tiếp tục: hoàn thiện plan full FE redesign trước, sau đó cập nhật `DESIGN.md` để mô tả semantic tokens hai theme, layout Admin/User, typography, surface, contrast, responsive và theme switch.
- Sau khi cập nhật design direction: tạo/cập nhật Stitch screens trong project `5412677534890310186` cho customer home/catalog, movie detail/booking, admin dashboard/list và light/dark + mobile variants; ghi screen IDs vào worklog.
- Sau Stitch mới bắt đầu sửa FE theo phase: theme runtime/persistence + pre-paint bootstrap; semantic CSS tokens; shared primitives/dialogs; customer/admin shells; customer screens; admin screens; booking/checkout sau cùng.
- Theme preference dự kiến lưu `system | light | dark` ở `localStorage` key `ticket_booking_theme`; áp dụng `data-theme` lên `html`, hỗ trợ `prefers-color-scheme`, `color-scheme`, `theme-color`, cross-tab sync và không flash sai theme.
- Scope redesign ban đầu chỉ đổi visual/theme/accessibility; không đổi API, query key, booking timing, seat rules, payment polling hoặc route paths.
- Cần kiểm tra browser các viewport `320`, `390`, `720`, `721`, `1024`, `1280`, `1440` ở cả hai theme; giữ loading/error/empty/disabled/focus, seat map, QR và ticket print.
- ĐÃ LÀM: Chốt direction Cobalt điện, Space Grotesk + Inter, mặc định theo hệ thống.
- ĐÃ LÀM: Cập nhật `DESIGN.md` và `AGENTS.md` sang CineBook Cobalt Editorial với semantic light/dark tokens, customer/admin layout rules và theme runtime contract.
- ĐÃ LÀM: Bắt đầu FE theme foundation: pre-paint bootstrap, `ThemeProvider`, preference `system/light/dark`, localStorage/cross-tab/system sync, `data-theme`, `color-scheme`, `theme-color`, theme selector ở customer/admin/admin login, font variable dependencies.
- ĐÃ LÀM: Tạo lớp `cobalt-editorial.css` cho customer/admin shell, hero, catalogue cards, panels, tables và mobile hierarchy; không đổi JSX/API/booking behavior.
- ĐÃ LÀM: Auth modal dùng shared focus trap, Escape, scroll lock và focus restoration; theme selector có ở customer desktop/mobile, admin sidebar/mobile header và admin login.
- ĐÃ LÀM: FE verification sau redesign foundation — lint, typecheck, 6 frontend tests, build và diff check đều pass.
- ĐÃ LÀM: Stitch MCP đã hoạt động trở lại; tạo design system mới `assets/16369739445538399432` với tên CineBook Cobalt Editorial, Space Grotesk + Inter, light/dark semantic tokens và hướng customer/admin riêng.
- ĐÃ LÀM: Tạo Stitch canonical desktop Admin Dashboard Cobalt Editorial `f48e9fba552a4c76a6fb5ad08d81c912`, gồm sidebar ổn định, metrics, chart, lịch chiếu và bảng giao dịch.
- ĐÃ GHI NHẬN: Yêu cầu tạo Stitch customer Home/Catalogue đã timeout hai lần và chưa xuất hiện screen; không giả lập ID. Các screen customer cũ vẫn là `93da427d5e094571bc9fbfc8549663da` (desktop tone tím) và `2320f094c2d6490dab49c90ef7e70edd` (mobile).
- ĐÃ LÀM: Bắt đầu migrate customer Home/Catalogue theo Stitch Cobalt Editorial; dùng desktop `70ec68912dc24a2abbfa1173ba8a160c` và mobile `2320f094c2d6490dab49c90ef7e70edd`, chuyển composition hero/quick booking/catalogue/promotion sang React + plain CSS với dữ liệu API thật, thay customer theme select bằng direct `ThemeSwitch`.
- ĐÃ LÀM: Browser kiểm tra Home desktop `1440px` và mobile `390px`; xác nhận hero/quick booking, dark toggle, localStorage và không còn overflow header mobile.
- ĐÃ LÀM: Migrate CinemaPage theo Stitch desktop `b865a8655e9f40a1ab3d55eff47abd26` và mobile `85b8f29177844aff9fbd3287790b936b`; chuyển sang hero/stats, directory search, responsive cinema cards, price summary và CTA bằng React + plain CSS, chỉ dùng dữ liệu cinema/roomCount thật.
- ĐÃ LÀM: Browser kiểm tra Cinema desktop `1440px` và mobile `390px`; card mobile chuyển thành một cột, desktop dùng grid responsive, không còn overflow. Lỗi console khi kiểm tra là API backend chưa chạy (`ERR_CONNECTION_REFUSED`), không phải lỗi build/runtime frontend.
- ĐÃ LÀM: Tạo Stitch canonical desktop Movie Detail Cobalt Editorial `d7d4e1bc57374b40933e7d471272ab12` bằng design system `assets/16369739445538399432`, đọc HTML reference và migrate `MoviePage` theo poster/info/showtime directory composition bằng React + plain CSS.
- ĐÃ LÀM: Movie Detail chỉ hiển thị dữ liệu có thật từ API/fallback (poster, backdrop, title, description, duration, status, showtime count, cinema/room); không giữ đạo diễn, diễn viên, ngày phát hành, review hoặc số ghế demo không có trong contract. Giữ nguyên trailer modal, filters, date selection và link chọn ghế.
- ĐÃ LÀM: Browser kiểm tra Movie Detail desktop `1440px` và mobile `390px`; hero/poster/showtime toolbar xếp đúng và không overflow. Lỗi console là API backend chưa chạy (`ERR_CONNECTION_REFUSED`). FE lint, typecheck và build pass sau batch.
- ĐÃ LÀM: Dùng Checkout SePay Cobalt desktop `1770a4bffa004d9ab0a92ddb9138d181`; job tạo Seats desktop bị timeout và không xuất hiện, không retry tạo trùng, dùng mobile seat reference hiện có `46f906538e2a41aea242298d064ee68c` để đối chiếu cấu trúc.
- ĐÃ LÀM: Migrate visual Seats/Checkout bằng `BookingSteps`, token Cobalt, seat map/legend/summary, countdown/pending/expired/success/error states và SePay QR card; giữ nguyên Couple pair, tối đa 10 ghế, hold/cancel guard, QR copy, payment polling và route/API behavior.
- ĐÃ LÀM: FE lint, typecheck, build pass; browser kiểm tra route seat error state mobile `390px`, không overflow. Console là API backend chưa chạy (`ERR_CONNECTION_REFUSED`).
- ĐÃ LÀM: Đối chiếu Stitch Admin Dashboard Cobalt desktop `f48e9fba552a4c76a6fb5ad08d81c912` và mobile `df37f134bf4640878c4d52a7aaa5ae37`; migrate `AdminDashboardPage` theo sidebar/dashboard operations composition.
- ĐÃ LÀM: Dashboard dùng dữ liệu thật phim/rạp/suất chiếu; metric cards, recent operations rows, status `Đang diễn ra/Sắp diễn ra/Đã lên lịch`, quick actions và responsive admin CSS. Không thêm doanh thu, chart, tỷ lệ lấp đầy, uptime hoặc số ghế demo vì API hiện chưa cung cấp.
- ĐÃ LÀM: FE lint, typecheck, build pass; browser kiểm tra admin redirect/login mobile `390px`, không overflow. Console chỉ là locations API chưa chạy.
- ĐÃ GHI NHẬN: Job tạo Stitch Account/Ticket Cobalt desktop bị timeout và không xuất hiện screen, không retry tạo trùng.
- ĐÃ LÀM: Polish `BookingsPage`, `TicketsPage`, `TicketPage` theo Cobalt account/ticket hierarchy bằng primitives hiện có: index/filter/search, booking/ticket cards, QR check-in stub, ticket detail split layout, print/check-in actions và mobile stacking; giữ nguyên query, cancel, QR và route behavior.
- ĐÃ LÀM: Hoàn thiện visual layer Cobalt cho Admin management Movies/TMDB, Cinemas/Rooms/Seats, Showtimes/bulk scheduling và Payments bằng plain CSS: bảng density cao, filter/toolbars, card cụm rạp, room/seat map, TMDB queue, free-slot/bulk preview, SePay tabs và responsive mobile; giữ nguyên API, mutation, modal và mọi loading/error/empty/pending state.
- ĐÃ LÀM: Admin management lint, typecheck, build, FE tests và diff check pass; browser login desktop `1440px`/mobile `390px` không overflow. Live route checks bị chặn do chưa có Admin session và backend `localhost:3000` chưa chạy (`ERR_CONNECTION_REFUSED`).
- ĐÃ LÀM: Khi countdown hold về 0, `BookingPage` refetch booking và chỉ khi server trả `EXPIRED` mới invalidate booking/sơ đồ ghế, điều hướng `replace` về `/showtimes/:showtimeId/seats`, đồng thời hiển thị cảnh báo phiên giữ ghế hết hạn một lần trên sơ đồ ghế.
- ĐÃ LÀM: Customer catalog cleanup: gỡ promotion giả, bỏ fallback movie/cinema hard-code và media fallback theo tên phim; bỏ claim tiện nghi/giá/giờ mở cửa không có trong API; nút Chỉ đường mở Google Maps theo địa chỉ thật, CTA catalogue vẫn dùng route thật.
- ĐÃ LÀM: Movie metadata batch: thêm `releaseDate`, `rating`, `genres`, `ageRating` vào Prisma/API/OpenAPI; TMDB import lưu release date, rating và genres thật; Admin Movie form có thể chỉnh metadata; giữ resync chỉ cập nhật media.
- ĐÃ LÀM: Movie metadata lint, typecheck, unit `56/56`, FE `6/6`, API check pass; Prisma migration đã tạo và schema validate, Prisma client generate cần dừng dev process đang khóa Windows query engine rồi đã chạy thành công.
- ĐÃ LÀM: QR vé thật bằng thư viện `qrcode`, payload versioned `cinebook-ticket:v1:<ticket.code>`, nền trắng/mực đen phù hợp in và xuất trình tại rạp; không thêm scanner/check-in Admin.
- ĐÃ LÀM: Customer Movie card/detail render rating, age rating, genres và release date khi API có dữ liệu; footer không còn `href="#"`; README đã cập nhật schema, TMDB mapping và QR scope.
- ĐÃ LÀM: UI polish batch: trailer modal dùng portal và scrim `overlay` theo theme thay nền đen cứng; xung đột giữ ghế `SEATS_HELD/SEATS_UNAVAILABLE` hiển thị popup và refetch sơ đồ; bỏ toggle check-in giả, QR luôn hiển thị với copy “Mã soát vé”; sửa font family sang `Space Grotesk Variable`/`Inter Variable`; Admin Cụm rạp có lọc tỉnh/thành, card gọn hơn, khoảng cách sidebar rõ hơn và checkbox suất chiếu nhỏ hơn. Stitch mobile reference mới: `1ac171b2f49e4edab09139adaac4961d`.

- ĐÃ CHỐT SCOPE: Không thêm field metadata vào `Cinema` cho amenities/giờ hoạt động riêng; không làm Admin sidebar/API/camera check-in. QR vé chỉ dành cho người dùng xuất trình tại rạp. Promotion giả sẽ được gỡ và module AI tạo promotion để backlog sau.
- ĐÃ SỬA: Movie response từng trả Prisma `Decimal` của `rating` thành chuỗi, khiến Admin chỉ đổi status cũng gửi rating dạng string và API trả 400 (`rating must not be greater/less...`). MoviesService nay chuẩn hóa rating về number ở response boundary; MovieForm cũng normalize rating trước khi submit; đã thêm regression test.
- CÒN LẠI: Browser verification live flow hold-expiry sau khi bật backend; tiếp tục rà format/price thật, filter catalogue và các copy cứng còn lại.

## 2026-09-25 — Email verification, ticket mail và seed format

- Thêm migration `20260925100000_email_verification_and_mail_outbox`: `User.emailVerifiedAt`, one-time verification token và outbox email có trạng thái/retry/dedupe.
- Đăng ký không cấp token trước xác thực; thêm `POST /auth/email/verify`, `POST /auth/email/resend`; login/refresh chặn user chưa xác thực. User cũ và admin seed được backfill là đã xác thực.
- Thêm `MailModule` dùng Nodemailer và worker scheduler retry mail; SMTP lỗi không rollback booking/payment. Mailpit local đã được loại bỏ, email dùng SMTP provider cấu hình từ env.
- SePay confirmation enqueue một email chứa toàn bộ ticket và QR inline bằng `qrcode`, dedupe theo booking.
- Frontend thêm route `/verify-email`, màn hình xác thực, trạng thái đăng ký chờ email và gửi lại email; regenerate OpenAPI/types.
- Seed tự bổ sung room `STANDARD`, `IMAX`, `FOUR_DX`, `SCREEN_X` cho mỗi cinema, không đổi format/reset layout room đã có showtime.
- Admin thêm quick publish phim; chuẩn hóa lỗi đổi format phòng sang `ROOM_FORMAT_HAS_SHOWTIMES`.
- Review fixes: outbox tự reclaim lock `PROCESSING` bị stale, register/resend gộp user-token-outbox trong transaction, resend khóa user để token cũ bị vô hiệu hóa, email dùng timezone `Asia/Ho_Chi_Minh`, frontend verify chống duplicate effect của React Strict Mode và quick publish hiển thị lỗi mutation.
- Verification: migration deploy, seed, lint, typecheck, build, unit `58/58`, FE `6/6`, E2E `6/6`, integration `13/13`, API check và diff check pass.

## 2026-09-24 — Room/showtime format, catalogue category và giá thật

- Thêm `RoomFormat`: `STANDARD`, `IMAX`, `FOUR_DX`, `SCREEN_X`; thêm `ShowtimeFormat` cho 2D/3D phụ đề/lồng tiếng.
- Thêm format vào Room/Showtime DTO, Prisma schema, response DTO và Admin form; không cho đổi format phòng khi phòng đã có showtime.
- Chuẩn hóa migration `20260924130000_room_showtime_formats_and_pricing`: backfill format cũ, backfill `basePrice` từ giá ghế snapshot thấp nhất, đặt multiplier mặc định `1.10/1.20`, sau đó chuyển pricing/format thành non-null.
- Public movie catalogue hỗ trợ `NOW_SHOWING`, `COMING_SOON`, `SPECIAL`; `SPECIAL` là phòng khác Standard hoặc suất 3D và lọc theo tỉnh/thành khi có.
- Public movie/cinema response tính `startingPrice` từ `basePrice` thấp nhất của suất tương lai; không thêm column nghiệp vụ vào `Cinema`.
- Customer Home hiển thị tab catalogue thật, giá bắt đầu, format phòng/suất và giá trong Movie Detail; Admin có chọn format khi lập lịch đơn/hàng loạt và lọc suất đặc biệt.
- Đồng bộ OpenAPI và generated frontend types.
- Review fixes: Admin update gửi cả `format`; seed chỉ cập nhật format khi file seed khai báo và bổ sung một phòng IMAX để có dữ liệu `SPECIAL`; thêm migration kiểm tra snapshot đủ mọi ghế vật lý; cinema `startingPrice` chỉ tính suất của movie `PUBLISHED`; DTO pricing response đồng bộ non-null; Quick Booking luôn dùng phim `NOW_SHOWING`, còn catalogue đặc biệt chỉ preview suất đặc biệt.
- Verification batch: lint, typecheck, build, backend unit `58/58`, FE `6/6`, E2E `6/6`, API check, Prisma validate/deploy/seed và `git diff --check` pass; integration bị chặn bởi port Windows `55432`.
