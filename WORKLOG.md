# WORKLOG — CineBook roadmap

## Mục tiêu dự án

CineBook là personal project với hai mục tiêu song song:

1. Học đủ sâu các phần quan trọng của một hệ thống thực tế: domain modeling, concurrency, payment, security, testing, observability, deployment và vận hành.
2. Đưa hệ thống chạy production thật với chi phí và độ phức tạp phù hợp personal project.

Ưu tiên quyết định:

- Correctness và security trước feature mới.
- Mỗi sprint phải tạo ra một năng lực có thể kiểm chứng bằng test, smoke flow hoặc production-like deployment.
- Không xây abstraction/microservice/Kubernetes chỉ để “đủ kiến trúc”. Chỉ thêm khi có nhu cầu thực tế.
- Không triển khai ticket check-in/consume trong roadmap hiện tại; QR chỉ dùng để khách xuất trình tại rạp.
- Không dùng dữ liệu giả trong customer/admin UI nếu API chưa cung cấp dữ liệu tương ứng.

## Baseline hiện tại

Đã có:

- NestJS modular monolith, React 19/Vite SPA, PostgreSQL, Redis và Prisma.
- Customer flow: catalogue, chọn suất, seat locking, Couple seat, booking expiry, checkout SePay, webhook idempotency và ticket history.
- Admin flow: movie/TMDB import, cinema/room/seat, showtime đơn/bulk/cinema-bulk, pricing policy và payment review.
- Email verification và ticket email qua MailOutbox + Worker Thread, retry/backoff, stale-lock recovery, graceful shutdown và QR inline.
- Theme system Cobalt Editorial light/dark, responsive customer/admin UI và generated OpenAPI types.
- Integration coverage cho booking concurrency, hold idempotency, expiry, cancel, SePay webhook và nhiều ticket.
- Verification gần nhất: lint, typecheck, build, backend unit, frontend tests, E2E, integration, API check và diff check pass.

Các giới hạn production chính:

- Dockerfile, local Compose stack, structured request/domain logging, Prometheus metrics, Discord alerts và GitHub Actions CI đã có; chưa có CD deployment production.
- Distributed tracing và staging environment chưa có.
- Rate limiting Redis, CORS allowlist, Helmet/security headers và Swagger production gate đã được triển khai trong Sprint 2.
- Chưa có refund/reconciliation flow hoàn chỉnh.
- Booking/ticket/payment list chưa có pagination chuẩn hóa.
- Backup/atomic restore scripts và isolated local/CI drill đã có; chưa kiểm chứng cutover/rollback trên staging hoặc production.
- Provider-specific SePay signature/IP verification vẫn phụ thuộc provider capability.
- Chưa có admin user management và audit log.

## Roadmap

### Sprint 0 — Baseline, documentation và release contract

Mục tiêu: biến trạng thái hiện tại thành baseline đáng tin trước khi mở rộng.

Việc cần làm:

- Đồng bộ README, WORKLOG, limitations, test matrix và API behavior với source hiện tại.
- Rà lại các mục roadmap lỗi thời: mock payment, ticket check-in và payment abstraction chưa cần thiết.
- Tạo production checklist cho environment, secret, SMTP, SePay, migration, seed, backup và rollback.
- Thực hiện smoke flow thật: register/verify/login → chọn nhiều ghế → SePay → nhận đủ ticket/email.
- Chạy browser verification desktop/mobile và light/dark cho các flow critical.
- Ghi lại release notes và quyết định kỹ thuật quan trọng.

Kỹ năng đạt được: release discipline, requirements traceability, smoke testing và documentation as code.

Definition of done:

- README và WORKLOG không mâu thuẫn với source.
- Có checklist chạy được trên một database/SMTP-like environment sạch.
- Critical customer flow có kết quả kiểm chứng và known issue rõ ràng.

### Sprint 1 — Frontend architecture và component extraction

Mục tiêu: tách frontend hiện tại khỏi các file page/component lớn để dễ học, test, refactor và mở rộng mà không làm thay đổi behavior.

Việc cần làm:

- Chụp baseline behavior trước refactor: route map, query key, mutation, loading/error/empty/pending state và screenshot các flow chính.
- Tách `fe/src/pages/CatalogPages.tsx` thành các page/section/component theo feature catalog; giữ nguyên movie catalogue, cinema directory, movie detail, trailer và filter behavior.
- Tách `fe/src/pages/BookingPages.tsx` thành seat map, seat legend, booking summary, checkout, countdown, QR payment và booking state components; giữ nguyên hold/cancel/expiry/polling/Couple seat.
- Tách `fe/src/pages/AccountPages.tsx` thành booking list, ticket list, ticket card, ticket detail, QR và shared record/filter components.
- Tách `fe/src/pages/AdminPages.tsx` theo domain admin: dashboard, movies/TMDB, cinemas/rooms/seats, showtimes/bulk scheduling và payments; giữ modal/form/table behavior.
- Tách `fe/src/pages/AuthPages.tsx` và `fe/src/components/ui.tsx` để auth modal, layout shell, admin shell, dialog focus, state primitives và navigation primitives có ranh giới rõ.
- Gom component dùng chung vào `fe/src/components/`; component theo nghiệp vụ vào `fe/src/features/` hoặc thư mục domain tương ứng; không tạo abstraction chỉ để bọc một dòng JSX.
- Tách query/mutation logic lặp lại thành hooks theo feature khi hook có trách nhiệm rõ; giữ `fe/src/api.ts` là HTTP boundary và không đưa fetch trực tiếp vào component mới.
- Chuẩn hóa props/type/local state, đặt tên file nhất quán và loại bỏ dead code sau mỗi extraction.
- Giữ plain CSS/Cobalt tokens; không thêm Tailwind, UI library hoặc font mới.
- Bổ sung component/helper tests cho extracted behavior và kiểm tra route/API/query key không đổi.

Kỹ năng đạt được: React composition, feature-based architecture, state ownership, custom hooks, testable UI boundaries và refactor an toàn.

Definition of done:

- Không còn page/component monolith khó bảo trì; mỗi file có một trách nhiệm chính và page chỉ điều phối composition.
- Route paths, API contracts, query keys, booking/payment behavior và accessibility states không thay đổi.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:fe` và browser smoke flow pass.
- Có ghi chú dependency graph đơn giản để tránh circular import giữa shared, feature và page layers.

## Sprint 1 completion record — 2026-09-29

Đã hoàn thành frontend architecture extraction:

- Customer features được tách dưới `fe/src/features/catalog`, `booking`, `account` và `auth`; các file trong `fe/src/pages/` còn thin compatibility barrels để giữ nguyên import và route map.
- Admin features được tách dưới `fe/src/features/admin`: dashboard, movies/TMDB, cinemas/rooms/seats, showtimes/bulk scheduling, payments và shared admin primitives; `AdminPages.tsx` giữ named exports cũ.
- `AuthModal` được đưa về `fe/src/features/auth/AuthModal.tsx`; dialog focus logic được đưa về `fe/src/components/useDialogFocus.ts`; shared UI chỉ giữ shell/primitives và compatibility exports.
- `fe/src/features/*/components.tsx` và `fe/src/features/admin/shared.tsx` giữ các component/helper dùng trong cùng feature; API boundary vẫn là `fe/src/api.ts`, không thêm fetch trực tiếp vào component.
- Route paths, API contracts, React Query keys, booking/hold/payment behavior, CSS class names và loading/error/empty/pending states được giữ nguyên.
- Thêm helper regression tests cho catalog labels, booking seat labels, admin YouTube parsing/showtime status; frontend suite hiện pass `10/10`.
- Verification: frontend lint pass, frontend typecheck pass, frontend tests `10/10`, full `npm run check` pass, integration `14/14`, API check pass và `git diff --check` pass.
- Browser smoke sau extraction pass ở Home desktop/mobile `390px` và Cinema mobile `390px`; route barrels render đúng dữ liệu seed, không có console error khi backend development chạy.

Dependency direction:

- `pages/*` → `features/*` → shared `components/*`, `auth/*`, `utils/*`, `api.ts`.
- Shared components không import page hoặc feature page; feature admin dùng `components/useDialogFocus.ts` trực tiếp để tránh phụ thuộc ngược vào UI barrel.
- `App.tsx` tiếp tục import từ page barrels, nên route wiring không đổi.

Trạng thái: Sprint 1 hoàn thành. Commit message đề xuất: `refactor(fe): extract feature-based page architecture`.

### Sprint 2 — Security và correctness hardening

Mục tiêu: giảm các rủi ro có thể làm lộ tài khoản, bị abuse hoặc tạo trạng thái payment sai.

Việc cần làm:

- Thêm rate limiting dựa trên Redis cho login, register, resend, verify, refresh và các admin mutation nhạy cảm.
- Giữ cooldown resend 60 giây như domain rule; rate limit tổng quát là lớp bảo vệ bổ sung.
- Cấu hình CORS allowlist theo environment, Helmet/security headers và giới hạn request body.
- Chỉ bật Swagger production khi có cấu hình cho phép hoặc có bảo vệ phù hợp.
- Production fail-fast khi thiếu `SEPAY_WEBHOOK_API_KEY`; bổ sung signature/IP verification nếu provider hỗ trợ.
- Hardening refresh-token rotation: test concurrent refresh, token reuse detection và revoke token family khi phát hiện reuse.
- Bổ sung integration tests cho migration backfill, showtime overlap edge cases và resend concurrent.
- Thêm cleanup job cho refresh token, verification token và dữ liệu mail outbox hết retention.

Kỹ năng đạt được: threat modeling, abuse prevention, secure session design và concurrency correctness.

Definition of done:

- Endpoint nhạy cảm có test abuse/429.
- Concurrent refresh chỉ chấp nhận một rotation hợp lệ.
- Production config không thể khởi động với secret/security setting thiếu.
- Cleanup job chạy idempotent và không xóa dữ liệu nghiệp vụ còn cần.

## Sprint 2 completion record — 2026-09-30

Đã hoàn thành security và correctness hardening:

- Redis atomic rate limiting cho login, register, resend, verify, refresh, SePay webhook và admin mutations; auth abuse có unit và HTTP-level `429` coverage.
- CORS allowlist, Helmet, request-body limit, production Swagger gate và production fail-fast cho `SEPAY_WEBHOOK_API_KEY`.
- Refresh-token family rotation có row lock, `replacedByJti`, reuse detection, revoke family và migration backfill cho token legacy.
- Maintenance scheduler chạy hàng ngày để cleanup refresh token, verification token và chỉ mail outbox `SENT` quá retention; delete predicates idempotent và giữ mail pending/failed.
- Verification: lint pass, typecheck pass, build pass, backend unit `75/75`, E2E `7/7`, integration `15/15`, API artifact check pass và `git diff --check` pass.
- Migration `20260930013408_refresh_token_reuse_hardening`, `20260930021640_backfill_refresh_token_families` và `20260930030000_backfill_refresh_token_families` đã deploy ở development và isolated integration database.
- Chưa chạy provider-specific SMTP/SePay sandbox; signature/IP verification vẫn cần xác nhận theo capability của provider.

Trạng thái: Sprint 2 hoàn thành. Commit message đề xuất: `security(be): harden rate limits and refresh token rotation`.

### Sprint 3 — Container, CI/CD và observability

Mục tiêu: có thể build, deploy, theo dõi và khôi phục hệ thống một cách lặp lại.

Định nghĩa cho người mới:

- **Image** là package bất biến chứa code, runtime và dependency. **Container** là một process đang chạy từ image.
- **Dockerfile** mô tả cách build image. `be/docker-compose.yml` cung cấp PostgreSQL/Redis development local; `docker-compose.app.yml` ghép API, frontend và Redis với PostgreSQL external qua `be/.env`.
- **CI** là máy sạch tự động checkout code, cài dependency, lint, typecheck, build và test sau mỗi push/PR.
- **CD** là bước phát hành image/artifact đã được CI kiểm tra lên staging/production. Sprint này mới làm nền tảng CI và container local; chưa tự deploy production.
- **Artifact** là đầu ra có thể lưu/chuyển tiếp, ví dụ Docker image, OpenAPI JSON hoặc frontend `dist/`.

Đã triển khai nền tảng:

- `be/Dockerfile`: multi-stage backend image, runtime non-root (`node` user); entrypoint deploy Prisma migrations rồi start Nest API.
- `fe/Dockerfile` + `fe/nginx.conf`: build Vite và serve SPA bằng Nginx, proxy `/api/` vào API container.
- `.github/workflows/ci.yml`: quality job chạy lint/typecheck/build/API check/unit/frontend/E2E, build backend/frontend Docker image và kiểm tra Compose/shell; integration job chạy PostgreSQL/Redis test stack.
- `requestLogger`: JSON request log gồm request ID, method, path, status và duration; không log body, token, cookie hoặc secret. Request ID từ client được giới hạn format/độ dài và dùng chung với error filter.
- `docker-compose.app.yml`: cloud-backed production-like stack gồm API, frontend và Redis; API đọc PostgreSQL URL/secrets từ `be/.env`, chạy bằng `npm run docker:up` và dừng bằng `npm run docker:down`.
- `dev:all`: development launcher khởi động PostgreSQL/Redis local rồi start backend/frontend; cấu hình mặc định khớp `be/.env.example`. Có thể chuyển sang Prisma Cloud bằng `DATABASE_URL`; migration được chạy riêng bằng `npm run prisma:deploy`.
- `ObservabilityModule`: protected Prometheus endpoint, request/domain metrics, Admin operations status, dashboard status cards và monitor mỗi phút.
- Discord alerts: database/Redis down, worker restart loop trong 5 phút, mail pending/failed/age và payment review; Redis cooldown/state cùng in-memory fallback khi Redis down.
- Recovery scripts: direct URL backup, clean-target atomic restore và `npm run ops:backup-restore-drill` với PostgreSQL 17 cô lập; CI có job riêng.

Các bước còn lại của Sprint 3:

- Tạo staging environment và CD deploy có approval; chưa cần domain cho phần local/CI này.
- Chạy cutover/migration rollback drill trên staging sau khi chọn hosting target; local restore drill không thay thế staging rehearsal.

Việc cần làm:

- [x] Tạo multi-stage Dockerfile cho backend và production frontend serving strategy.
- [x] Viết CI pipeline chạy lint, typecheck, build, unit, frontend, E2E, integration và API drift check.
- [ ] Thiết lập staging environment gần production với PostgreSQL/Redis/SMTP test provider.
- [x] Thêm structured JSON logging với request ID cho request metadata; không log token, password, secret hoặc QR payload.
- [x] Thêm metrics tối thiểu: request latency/error rate, hold conflicts, booking expiry, payment review, outbox pending/failed/age và worker restart.
- [x] Readiness kiểm tra database, Redis và mail worker; operations status/metrics theo dõi thêm outbox age/backlog và payment review.
- [x] Thiết kế safe backup/atomic restore, forward-fix rollback runbook và kiểm chứng restore trên database local cô lập.
- [x] Thêm Discord alert cho payment `REVIEW_REQUIRED`, mail pending/failed/age, Redis/DB down và worker restart loop; có cooldown, deduplication và recovery.

Verification Sprint 3 nền tảng:

- Backend và frontend Docker image build pass; CI đã có bước build bắt buộc cho cả hai image.
- Cloud-backed Compose smoke pass: API readiness `200`, frontend Nginx `200`, API proxy hoạt động; `redis`, `api` và `frontend` có healthcheck, API migration startup kết nối Prisma Cloud thành công. Compose bind frontend ở `127.0.0.1:8080`, trust đúng một Nginx proxy hop và mặc định tắt Mail Worker.
- Verification gần nhất: backend unit `91/91`, frontend `10/10`, E2E `9/9`, integration `15/15`, API check pass.
- Prisma Cloud verification pass: `prisma migrate deploy` và `prisma migrate status`; database không còn migration pending.
- Isolated backup/restore drill pass: deploy đủ 15 migrations, backup custom archive, atomic restore vào database rỗng, booking/payment/outbox checksum `1:1:1:100000.00` và migration status up to date.
- Chưa deploy staging/production, chưa có distributed tracing hoặc CD approval; CI clean-runner có integration stack và backup/restore stack cô lập.

Trạng thái: infrastructure/observability/recovery baseline của Sprint 3 đã hoàn thành; staging/CD và staging rollback rehearsal được chủ động deferred, nên chưa đánh dấu toàn bộ Sprint 3 hoàn thành. Commit message đề xuất: `build: add Docker runtime and CI foundations`.

Kỹ năng đạt được: containerization, CI/CD, SRE fundamentals, logs/metrics/health checks và disaster recovery.

Definition of done:

- Một commit có thể build/deploy staging từ CI.
- Có dashboard/log query đủ để điều tra một booking bằng request ID/booking ID.
- Backup restore được kiểm chứng trên database cô lập.
- Có rollback procedure đã chạy thử.

### Sprint 4 — Payment reconciliation và refund thủ công

Mục tiêu: hoàn thiện vòng đời payment mà không cần xây abstraction provider chung khi mới có SePay.

Việc cần làm:

- Chuẩn hóa state transition giữa `SepayTransaction`, `Payment`, `Booking` và ticket.
- Thêm reconciliation workflow cho giao dịch `REVIEW_REQUIRED`: tìm booking, xác nhận thủ công hoặc đánh dấu hoàn tiền.
- Thêm refund record/attempt với actor, amount, reason, provider reference, admin note và timestamp.
- Định nghĩa chính sách refund: cutoff trước suất, hoàn toàn phần/toàn phần, ticket đã dùng và ghế được bán lại.
- Bảo đảm refund idempotent; không để payment đã refund nhưng ticket vẫn `ACTIVE` hoặc booking vẫn có thể dùng.
- Bổ sung customer/admin UI cho trạng thái refund và lỗi payment rõ ràng.
- Gửi email thông báo refund/reconciliation nếu phù hợp.
- Chỉ tách payment provider interface khi chuẩn bị tích hợp provider thứ hai.

Kỹ năng đạt được: payment state machine, reconciliation, idempotency, financial auditability và manual operations.

Definition of done:

- Mọi transition payment/refund có invariant và integration test.
- Admin xử lý được giao dịch review mà không cấp vé trùng.
- Refund có audit trail và không thể thực hiện hai lần ngoài ý muốn.

### Sprint 5 — Pagination, query performance và scale vừa đủ

Mục tiêu: tránh các endpoint danh sách tải toàn bộ dữ liệu khi production bắt đầu có nhiều user/booking.

Đã hoàn thành:

- Áp dụng cursor/keyset pagination cho customer bookings/tickets, admin bookings và admin SePay transactions.
- Response cursor chuẩn hóa thành `{ data, meta }` với `limit`, `hasNextPage`, `hasPreviousPage`, `nextCursor`, `previousCursor`; movies/showtimes vẫn giữ contract offset.
- Cursor versioned, opaque, HMAC-signed và ràng buộc endpoint/filter/user scope; reject cursor tampered, sai filter hoặc sai hướng.
- Filter/search được thực thi backend trước pagination; customer ownership luôn nằm trong query authorization.
- Query dùng stable ordering `createdAt DESC, id DESC` cho booking/ticket và `transactionDate DESC, id DESC` cho SePay, với `take: limit + 1` và không count mỗi trang.
- URL state được đồng bộ cho customer bookings/tickets, admin bookings và admin payments; thay filter/search/cursor reset đúng trạng thái.
- Thêm composite indexes phục vụ ownership/status và keyset access; index SePay dùng `transactionDate` đúng với sort contract.
- Cập nhật OpenAPI, generated frontend types, README và integration contract cho response mới.
- Bổ sung unit coverage cho cursor ký HMAC, tampering/scope/direction, duplicate timestamp và backward metadata.

Còn lại sau Sprint 5:

- Chưa có benchmark dataset production-size và kết quả `EXPLAIN (ANALYZE, BUFFERS)` được commit; indexes hiện tại cần được xác nhận lại trên staging dữ liệu đại diện.
- Chưa chuyển movies/showtimes/cinemas/rooms sang cursor vì vẫn giữ offset contract theo quyết định phạm vi Sprint 5.

Kỹ năng đạt được: database indexing, query planning, API pagination design và performance measurement.

Definition of done:

- Không còn bốn list nghiệp vụ mục tiêu tải không giới hạn.
- Query có filter/sort, cursor integrity và ownership được kiểm chứng bằng unit/integration tests.
- Migration `20261015090000_sprint5_cursor_indexes` bổ sung composite indexes cho keyset access; cần chạy `npm run prisma:deploy` ở môi trường có database trước khi release.
- Frontend giữ loading/empty/error/pagination state đúng trên mobile và URL reload được.

### Sprint 6 — Automated critical journeys và quality gate

Mục tiêu: biến các flow quan trọng thành regression tự động để có thể refactor an toàn.

Đã triển khai bước đầu:

- Thêm Playwright Test với Chromium desktop/mobile, chạy serial để giữ fixture ổn định.
- Thêm browser smoke cho customer catalogue, customer auth guard, admin auth guard và responsive overflow ở mobile.
- Thêm commands `npm run test:browser`, `npm run test:browser:smoke`, `npm run test:browser:ui`.
- CI cài Chromium, build frontend preview, chạy browser smoke và upload report/trace/screenshot khi fail.
- Browser runner dùng frontend preview độc lập qua `PLAYWRIGHT_BASE_URL`, không cần database development cho smoke suite.
- Thêm `npm run test:browser:full`: dựng PostgreSQL/Redis test stack trên port riêng, deploy migration, chạy API test và chạy Playwright với API test URL; cleanup tự động, có `KEEP_BROWSER_INFRA=1` để giữ stack khi debug.
- Thêm frontend jsdom/Testing Library test cho verification state và resend cooldown.
- Thêm isolated browser fixture cho customer/admin, movie, cinema, room, showtime và seats; full-stack suite bao phủ register/verification/login/logout, Couple hold/cancel, checkout + SePay webhook + multi-ticket/ticket-email Mailpit assertion và invalid-token error state.
- Thêm `test:api:contract` cho các auth/health/booking/payment operation, schema chính và idempotency header; CI chạy full-stack browser + API contract gates.

Việc cần làm tiếp:


- Bổ sung component/helper tests cho auth unverified + resend cooldown, booking confirmed redirect và multi-ticket display.
- Bổ sung browser tests cho register/verify/login, Couple seat, hold expiry/cancel, checkout/webhook và nhận nhiều ticket.
- Chạy test ở viewport desktop/mobile và light/dark.
- Kiểm tra keyboard/focus/dialog/form error accessibility.
- Bổ sung contract tests cho API error codes, OpenAPI và generated frontend types.
- Đưa smoke suite vào CI sau deploy staging.

Kỹ năng đạt được: testing pyramid, browser automation, contract testing, accessibility và release confidence.

Definition of done:

- Critical customer flow chạy tự động trên staging.
- Regression quan trọng không phụ thuộc dữ liệu development thủ công.
- CI chặn merge khi test/API artifact/security check thất bại.

### Voucher/combo — giai đoạn A: nền tính tiền

- Payment scope correction: removed combo-related checkout/refund row locks and their test mock; SepayService is unchanged from the pre-combo implementation. Booking computes the immutable total, payment consumes that total. Existing transactional payment audit and refund safeguards remain intact.

- CI follow-up: GitHub Actions run #30 (`39427530868`) quality/integration passed but backup/restore drill failed. Reproduced locally: raw SQL fixture omitted required ticketSubtotal. Updated fixture and restore checksum to verify full booking price breakdown/version; isolated drill now passes. No remote rerun/push performed.

- B1 corrected scope: catalog and cinema-specific offers with MANAGE_COMBOS; combo selection is submitted only with initial booking hold. Booking/ticket contents are immutable thereafter. Removed replaceSelection/update endpoint, fulfillment endpoint, FULFILL_COMBOS and comboFulfilledAt from the unshipped B1 migration/schema/contracts. Counter staff handle delivery outside the app; no delivery-based refund guard is claimed. Booking creation snapshots combo price/name/contents with seats and audit atomically; idempotency includes canonical combo IDs/quantities while preserving old ticket-only hashes. Tests cover initial purchase, snapshots, invalid selections, rollback, retry/content conflicts, canonical ordering, removed routes and combined-payment refund. No FE combo screens, standalone combo orders or browser combo journey yet; B2 remains open.

- Added persisted booking ticket/combo/discount subtotals and pricingVersion, SQL historical backfill and balance/non-negative/version constraints. Hold uses a Decimal-based pricing calculator; payment still uses the unchanged payable total. Generated booking API fields. Unit coverage covers scopes, caps, rounding and invalid money/quantities; integration covers historical migration and persisted constraints/payment parity. No voucher/combo endpoints or UI yet; subsequent phases remain open. Deploy migration before new backend; old backend cannot write the new required subtotal and must not run concurrently during rollout.

### Sprint 7 — Account, RBAC và audit log

#### Invitation audit follow-up

- Final audit review follow-up: inventoried controller mutation routes and module AuditService wiring. Fixed user-access snapshots to include before/after permission arrays and read the target inside the transaction; fixed automatic review resource IDs to use the internal SepayTransaction ID. Added PostgreSQL regressions for access/session rollback, refund ticket/seat/payment/outbox rollback and retry, and automatic review rollback. README includes an explicit coverage matrix and exclusions (read-only previews, self-service auth, workers/maintenance). Sprint remains open for final review and remaining invitation expiry/inviter-permission/accessibility cases.

- Invitation UI follow-up: show inviter name/email and separate SMTP delivery status; normalize PROCESSING to PENDING, poll visible list every 10 seconds, and allow expired invitations to be resent/revoked. Add focus trap/Escape/focus restoration, native email validation, review-step error alerts and keyboard/browser regressions. Browser resend-success uses a mocked response; real cooldown/revoke use the isolated API and real resend token rotation remains covered by integration.

- 2026-10-18 browser verification: added `tests/browser/admin-invitations.spec.ts` and ran the isolated Mailpit/full-stack suite successfully (14/14). The test creates the invitation through UI, extracts the full URL from SMTP-delivered email, checks its origin against configured frontend URL, accepts and logs in through UI, checks allowed `VIEW_SYSTEM` (200), denied user management (403), and consumed token rejection (401). `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` supports an existing local Chromium installation without changing CI defaults.
- Catalog audit follow-up: cinema/room/seat CRUD, seat-layout replacement and all showtime mutations now write transactional audit, including one entry per bulk-created showtime. Added real PostgreSQL snapshot/rollback regression and unit redaction/date/Decimal serialization coverage.
- Lifecycle audit follow-up: movie create/update/archive/import/resync, booking hold/cancel/expiry, payment checkout/receipt/review/admin status/confirmation now write audit in the mutation transaction. Manual confirmation note is written inside the booking/payment/ticket/outbox transaction rather than after commit. Added AuditModule to BookingsModule (rollback integration caught missing injection), actual archive before-state, source metadata and lifecycle integration rollback/idempotency/redaction cases. Final coverage review remains open. Sprint 7 is not complete.
- Real invitation browser follow-up: resend through UI after the unmodified production cooldown, receive a second Mailpit email, reject old token at preview/accept, accept/login with replacement and reject reuse; verify list polling shows accepted. Added revoked real-email link rejection and failed login (no account created). No API response mocks or DB/clock manipulation in these new scenarios. Shared-IP public rate limit is preserved by waiting for its window to expire before subsequent tests.

- Follow-up 2026-10-18: isolated PostgreSQL integration exposed an advisory-lock `void` deserialization failure; cast the lock result to text. Added four real transaction regression tests; full isolated suite passes 25/25. Invitation SMTP now skips obsolete/revoked/expired tokens, and public preview/accept responses have explicit OpenAPI DTOs. End-to-end Mailpit/browser acceptance remains pending.

- Recheck inviter role, disabled state and grantable permissions at preview/accept; apply grant restrictions to the existing user-access update path too.
- Serialize invitation creation per email and lock invitation rows for resend/accept/revoke; include token hash in acceptance predicate and attribute acceptance audit to the new user.
- Separate invitation list visibility from create dialog state; confirm resend/revoke before sending mutations. Preserve the acceptance form after a password-confirmation mismatch.
- Add six mocked security regression tests. These do not establish PostgreSQL concurrency/atomic rollback guarantees; isolated integration and complete Mailpit acceptance browser coverage remain pending.
- Email links continue to use environment-configured `PUBLIC_APP_URL`.

Đang triển khai nền tảng: AuthSession, JWT `sid`, guard kiểm tra revocation/disabled user, memory access token, localStorage refresh token dùng chung giữa các tab, Web Locks và BroadcastChannel. Đã bỏ browser HttpOnly cookie endpoints; frontend dùng lại `/auth/login`, `/auth/refresh`, `/auth/logout` để giữ contract JSON. Migration buộc login lại; browser test nhiều tab đã pass với Docker/PostgreSQL/Redis/Mailpit. Đã bổ sung password reset một lần qua mail outbox, đổi mật khẩu, thu hồi toàn bộ session, API/UI quản lý session và các cooldown/expiry cơ bản. Lint, typecheck, build, unit 122/122, e2e 9/9, frontend 11/11, integration 21/21 và OpenAPI check pass. Đã thêm nền RBAC chi tiết: enum/quyền theo domain, bảng gán quyền và PermissionsGuard trên route admin; thêm AuditLog/AuditService allowlist và endpoint đọc audit. Đã thêm API/UI quản lý user và permission (`/users/admin`, `/admin/users`), disable/enable user thu hồi session, revoke-all session và audit refund/user-access trong transaction. Đã bổ sung audit filter/UI (`/admin/audit-logs`) và API quản lý session user (`/users/admin/:id/sessions`, revoke session/revoke-all). Vẫn còn cần rà soát audit coverage cho mọi catalog/scheduling mutation và bổ sung test chuyên sâu. Refresh token localStorage có rủi ro XSS và không có mức bảo vệ như HttpOnly cookie.

Mục tiêu: hoàn thiện quản trị tài khoản và trách nhiệm thao tác khi hệ thống chạy thật.

Việc cần làm:

- Password reset bằng token một lần, expiry, cooldown và email.
- Đổi mật khẩu, xem/thu hồi session và logout all sessions.
- Admin user management tối thiểu: tạo, disable, role và reset access.
- Tách quyền theo nhóm catalog, scheduling, payment/refund và system operations.
- Audit log cho mọi admin mutation: actor, action, resource, before/after summary, request ID và timestamp.
- Admin UI tra cứu user, session và audit theo thời gian/action/actor.

Kỹ năng đạt được: identity lifecycle, RBAC, auditability và operational accountability.

Definition of done:

- Tài khoản bị disable không thể đăng nhập hoặc refresh.
- Admin mutation quan trọng đều truy ngược được actor và request.
- Password/reset/session flow có test expiry, reuse và concurrent behavior.

### Backlog sau production baseline

Chỉ làm sau khi các sprint trên ổn định:

- TMDB scheduled sync và quản lý retry.
- Dashboard doanh thu/occupancy/conversion bằng dữ liệu thật.
- Promotion/coupon khi đã chốt rule accounting và refund interaction.
- Notification preferences.
- Payment provider thứ hai và abstraction chung.
- Recommendation/personalization.
- Ticket check-in/consume nếu product scope thay đổi trong tương lai.

## Production gates

Không coi dự án là production-ready nếu thiếu:

- Secret/env validation, CORS allowlist, rate limiting và security headers.
- CI chạy static checks, tests, integration và API drift.
- Docker/deployment recipe, migration/rollback và backup/restore drill.
- Structured logs, request ID, health/readiness và alert tối thiểu.
- Payment reconciliation/refund policy rõ ràng.
- Smoke test customer flow trên staging với SMTP/SePay sandbox hoặc test provider.

## Sprint 0 completion record — 2026-09-29

### Release checklist v0

- [x] `be/.env` tồn tại và các biến local cần thiết đã được kiểm tra theo set/missing.
- [ ] `fe/.env` được tạo từ `fe/.env.example` khi cần override API URL.
- [x] PostgreSQL và Redis development local chạy healthy; Prisma Cloud vẫn dùng được qua `DATABASE_URL` khi cần.
- [x] Migrations đã deploy; seed chạy idempotent.
- [x] OpenAPI artifacts không drift.
- [x] Lint, typecheck, build, unit, frontend, E2E và integration pass.
- [x] Liveness/readiness, catalog và Swagger JSON smoke pass.
- [ ] SMTP sandbox/test provider smoke pass.
- [ ] SePay sandbox/test webhook smoke pass.
- [ ] Staging backup/restore và rollback drill pass.
- [ ] Production secrets, domain/CORS allowlist và monitoring đã cấu hình.

### Baseline result

Đã hoàn thành baseline và release contract:

- `npm run check:ci` pass: OpenAPI artifact check, lint, typecheck, build, backend unit `68/68`, frontend `6/6`, E2E `6/6`, integration `14/14`.
- Development PostgreSQL/Redis đã khởi động bằng `npm run infra:up`; migration không còn pending và `npm run prisma:seed` chạy thành công.
- Runtime smoke pass với backend development: `/api/v1/health` `200`, `/api/v1/health/ready` `200` với `database=up`, `redis=up`, `mailWorker=up`; `/api/v1/movies` và `/api/docs-json` trả `200`.
- Browser smoke pass ở Home desktop và Home/Cinema mobile `390px`; không có console error trong các route đã kiểm tra.
- Đã kiểm tra trạng thái cấu hình `be/.env` theo set/missing, không in secret; `fe/.env` chưa tồn tại và có thể tạo từ `fe/.env.example` khi chạy frontend ngoài local default.
- Full provider smoke `register → verify email → login → SePay → ticket email` chưa chạy với provider thật để tránh gửi email/giao dịch từ môi trường development; cần SMTP/SePay sandbox hoặc test provider ở Sprint 2 staging.
- Known warnings không chặn baseline: Prisma báo `package.json#prisma` sẽ deprecated ở Prisma 7; Vite cảnh báo bundle frontend lớn hơn 500 kB.

Trạng thái: Sprint 0 hoàn thành phần baseline/documentation/release contract; provider smoke được ghi nhận là staging gate chưa thực hiện. Roadmap tiếp theo là Sprint 1 — Frontend architecture và component extraction.

## Verification commands

```bash
npm run lint
npm run typecheck
npm run build
npm test
npm run test:fe
npm run test:e2e
npm run test:integration
npm run ops:backup-restore-drill
npm run api:check
npm run check:ci
git diff --check
```

Trạng thái: roadmap đã được chốt theo mục tiêu personal project học sâu và production thật; chưa commit.
