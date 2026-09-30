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

- Structured logging, metrics/tracing và CI/CD chưa có.
- Rate limiting Redis, CORS allowlist, Helmet/security headers và Swagger production gate đã được triển khai trong Sprint 2.
- Chưa có refund/reconciliation flow hoàn chỉnh.
- Booking/ticket/payment list chưa có pagination chuẩn hóa.
- Chưa có Dockerfile/deployment recipe và backup/restore runbook.
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

Việc cần làm:

- Tạo multi-stage Dockerfile cho backend và production frontend serving strategy.
- Viết CI pipeline chạy lint, typecheck, build, unit, frontend, E2E, integration và API drift check.
- Thiết lập staging environment gần production với PostgreSQL/Redis/SMTP test provider.
- Thêm structured JSON logging với request ID cho cả success và error; tuyệt đối không log token, password, secret hoặc QR payload.
- Thêm metrics tối thiểu: request latency/error rate, hold conflicts, booking expiry, payment review, outbox pending/failed/age và worker restart.
- Mở rộng readiness với mail worker/outbox signal phù hợp, tránh báo healthy khi worker chết lâu.
- Viết backup PostgreSQL, restore drill và rollback migration runbook.
- Thêm alert cho payment `REVIEW_REQUIRED`, mail backlog, Redis/DB down và worker restart loop.

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

Việc cần làm:

- Chuẩn hóa response `{ data, meta }` với `page`, `pageSize`, `total`, `totalPages`.
- Áp dụng cho customer bookings/tickets và admin payments trước; sau đó cinemas/rooms/showtimes nếu cần.
- Chuẩn hóa filter/search/sort/date range ở backend thay vì lọc toàn bộ ở frontend.
- Đồng bộ query state vào URL để reload/chia sẻ được.
- Rà index và query plan bằng dữ liệu lớn; chỉ thêm cache khi benchmark chứng minh cần.
- Giữ giới hạn page size và validate sort field để tránh query abuse.
- Bổ sung load test cho catalogue, booking list, ticket list và payment list.

Kỹ năng đạt được: database indexing, query planning, API pagination design và performance measurement.

Definition of done:

- Không còn list nghiệp vụ production nào tải không giới hạn.
- Query có filter/sort được kiểm chứng bằng EXPLAIN hoặc benchmark.
- Frontend giữ loading/empty/error/pagination state đúng trên mobile.

### Sprint 6 — Automated critical journeys và quality gate

Mục tiêu: biến các flow quan trọng thành regression tự động để có thể refactor an toàn.

Việc cần làm:

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

### Sprint 7 — Account, RBAC và audit log

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
- [x] PostgreSQL và Redis development chạy healthy.
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
npm run api:check
npm run check:ci
git diff --check
```

Trạng thái: roadmap đã được chốt theo mục tiêu personal project học sâu và production thật; chưa commit.
