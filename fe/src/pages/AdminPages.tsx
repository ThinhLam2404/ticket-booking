import { useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useLocationContext } from "../auth/LocationContext";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  useDialogFocus,
} from "../components/ui";
import type {
  Cinema,
  CreateCinemaRequest,
  CreateMovieRequest,
  CreateRoomRequest,
  CreateSeatRequest,
  BulkShowtimePreviewResponse,
  BulkShowtimeRequest,
  CreateShowtimeRequest,
  FreeSlotsResponse,
  Movie,
  MovieStatus,
  TmdbMovieResponse,
  RoomResponse,
  Seat,
  SeatType,
  Showtime,
  UpdateCinemaRequest,
  UpdateMovieRequest,
  UpdateShowtimeRequest,
} from "../types";
import { errorMessage, formatDate, formatTime, money } from "../utils/format";
import { buildSeatLayout, isCompleteSeatLayout, validateSeatPreset } from "../utils/seat-layout";
import { ThemeSwitch } from "../components/ThemeToggle";
import { patchTmdbMovieCaches, runTmdbImportQueue, TMDB_IMPORT_LIMIT } from "../utils/tmdb-import";

type FormMode = "create" | "edit";

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

const movieStatuses: MovieStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const seatTypes: SeatType[] = ["STANDARD", "VIP", "COUPLE"];
const roomFormats = ["STANDARD", "IMAX", "FOUR_DX", "SCREEN_X"] as const;
const showtimeFormats = ["TWO_D_SUBTITLED", "TWO_D_DUBBED", "THREE_D_SUBTITLED", "THREE_D_DUBBED"] as const;
const roomFormatText: Record<(typeof roomFormats)[number], string> = { STANDARD: "Tiêu chuẩn", IMAX: "IMAX", FOUR_DX: "4DX", SCREEN_X: "ScreenX" };
const showtimeFormatText: Record<(typeof showtimeFormats)[number], string> = { TWO_D_SUBTITLED: "2D · Phụ đề", TWO_D_DUBBED: "2D · Lồng tiếng", THREE_D_SUBTITLED: "3D · Phụ đề", THREE_D_DUBBED: "3D · Lồng tiếng" };
const editableSeatTypes: SeatType[] = ["STANDARD", "VIP"];
const emptySeats: Seat[] = [];

function movieStatusText(status: MovieStatus) {
  return status === "DRAFT"
    ? "Bản nháp"
    : status === "PUBLISHED"
      ? "Đang chiếu"
      : "Đã lưu trữ";
}

function seatTypeText(type: SeatType) {
  return type === "STANDARD" ? "Tiêu chuẩn" : type === "VIP" ? "VIP" : "Đôi";
}

function AdminPage({ children }: { children: ReactNode }) {
  return <section className="admin-page">{children}</section>;
}

export function AdminLoginPage() {
  const { user, loginAsAdmin } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const destination =
    (location.state as { from?: string } | null)?.from ?? "/admin";

  if (user?.role === "ADMIN") return <Navigate to={destination} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      await loginAsAdmin({ email, password });
    } catch (cause) {
      setFormError(
        errorMessage(
          cause,
          "Thông tin xác thực không chính xác hoặc tài khoản chưa được cấp quyền quản trị.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-theme"><ThemeSwitch /></div>
      <div className="admin-login-brand">
        <Link className="brand" to="/">
          <span className="brand-mark">▰</span>
          <span>
            Cine<span>Book</span>
          </span>
        </Link>
        <p className="eyebrow">CINEBOOK CONTROL</p>
        <h1>
          Không gian vận hành
          <br />
          cho rạp chiếu.
        </h1>
        <p>
          Dành riêng cho ban điều hành cụm rạp, quản lý phòng chiếu và bộ phận
          vận hành vé.
        </p>
        <div className="admin-security">
          <span>◈</span>
          <div>
            <strong>Truy cập được bảo vệ</strong>
            <small>Phân quyền quản trị RBAC · SSL 256-bit</small>
          </div>
        </div>
      </div>
      <form
        className="admin-login-card"
        autoComplete="off"
        onSubmit={(event) => void submit(event)}
      >
        <p className="eyebrow">XÁC THỰC QUẢN TRỊ</p>
        <h2>Đăng nhập quản trị</h2>
        <p className="admin-login-copy">
          Nhập thông tin tài khoản được phân quyền bởi CineBook.
        </p>
        <label>
          Email quản trị viên
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@cinebook.vn"
            autoComplete="off"
          />
        </label>
        <label>
          Mật khẩu
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mật khẩu"
            autoComplete="new-password"
          />
        </label>
        <div className="admin-login-options">
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />{" "}
            Ghi nhớ phiên
          </label>
          <span className="admin-muted-link">Quên mật khẩu?</span>
        </div>
        {formError && (
          <p className="admin-login-error" role="alert">
            {formError}
          </p>
        )}
        <button className="primary admin-login-submit" disabled={loading}>
          {loading ? "Đang xác thực…" : "Đăng nhập hệ thống"}
        </button>
        <Link className="admin-back-link" to="/">
          <span>←</span> Quay lại trang khách
        </Link>
      </form>
    </div>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="admin-toolbar">{children}</div>;
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  className = "",
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, onClose);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`admin-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        tabIndex={-1}
      >
        <button
          className="modal-close"
          type="button"
          aria-label="Đóng"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="admin-modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({
  state,
  loading,
  error,
  onClose,
}: {
  state: ConfirmState;
  loading: boolean;
  error?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, onClose);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="admin-modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <p className="eyebrow">XÁC NHẬN THAO TÁC</p>
        <h2 id="confirm-title">{state.title}</h2>
        <p className="admin-copy">{state.message}</p>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button
            className="secondary"
            type="button"
            disabled={loading}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            className="danger"
            type="button"
            disabled={loading}
            onClick={state.onConfirm}
          >
            {loading ? "Đang xử lý…" : "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`admin-field${wide ? " admin-field-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function FormActions({
  loading,
  onCancel,
  submitLabel,
}: {
  loading: boolean;
  onCancel?: () => void;
  submitLabel: string;
}) {
  return (
    <div className="form-actions">
      {onCancel && (
        <button
          className="secondary"
          type="button"
          disabled={loading}
          onClick={onCancel}
        >
          Hủy
        </button>
      )}
      <button className="primary" disabled={loading}>
        {loading ? "Đang lưu…" : submitLabel}
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  wide = false,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  wide?: boolean;
}) {
  function update(nextValue: number) {
    const validValue = Math.max(min, Number.isFinite(nextValue) ? nextValue : min);
    onChange(max === undefined ? validValue : Math.min(max, validValue));
  }

  return (
    <div className={`admin-field${wide ? " admin-field-wide" : ""}`}>
      <span>{label}</span>
      <div className="number-field">
        <button type="button" aria-label={`Giảm ${label.toLowerCase()}`} disabled={value <= min} onClick={() => update(value - step)}>
          −
        </button>
        <input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={(event) => update(Number(event.target.value))} />
        <button type="button" aria-label={`Tăng ${label.toLowerCase()}`} disabled={max !== undefined && value >= max} onClick={() => update(value + step)}>
          +
        </button>
      </div>
    </div>
  );
}

function CharacterTextarea({
  label,
  value,
  maxLength,
  onChange,
  rows,
  required = false,
}: {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  rows: number;
  required?: boolean;
}) {
  return (
    <label className="admin-field admin-field-wide">
      <span>{label}</span>
      <span className="textarea-shell">
        <textarea aria-label={label} required={required} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} />
        <small>{value.length.toLocaleString("vi-VN")} / {maxLength.toLocaleString("vi-VN")} ký tự</small>
      </span>
    </label>
  );
}

function mutationMessage(cause: unknown) {
  return errorMessage(cause, "Không thể hoàn tất thao tác.");
}

function youtubeKey(value: string | null | undefined) {
  const input = value?.trim() ?? "";
  if (!input) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const hostname = url.hostname.toLowerCase();
    const isYouTubeHost = new Set([
      "youtu.be",
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
    ]).has(hostname);
    if (!isYouTubeHost) return null;
    const key =
      hostname === "youtu.be"
        ? (url.pathname.split("/").filter(Boolean)[0] ?? "")
        : (url.searchParams.get("v") ??
          /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname)?.[1] ??
          "");
    return /^[A-Za-z0-9_-]{11}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

function dashboardShowtimeStatus(showtime: Showtime) {
  const now = Date.now();
  const startsAt = new Date(showtime.startsAt).getTime();
  const endsAt = new Date(showtime.endsAt).getTime();
  if (now >= startsAt && now < endsAt) return { label: "Đang diễn ra", tone: "live" };
  if (startsAt > now && startsAt - now <= 30 * 60 * 1000) return { label: "Sắp diễn ra", tone: "soon" };
  return { label: "Đã lên lịch", tone: "scheduled" };
}

export function AdminDashboardPage() {
  const moviesQuery = useQuery({
    queryKey: ["admin-movies", "dashboard"],
    queryFn: ({ signal }) => api.adminMovies({ pageSize: 100 }, signal),
  });
  const cinemasQuery = useQuery({
    queryKey: ["admin-cinemas"],
    queryFn: ({ signal }) => api.cinemas(undefined, signal),
  });
  const showtimesQuery = useQuery({
    queryKey: ["admin-showtimes", "dashboard"],
    queryFn: ({ signal }) =>
      api.adminShowtimes({ pageSize: 100, includePast: true }, signal),
  });
  const isPending =
    moviesQuery.isPending || cinemasQuery.isPending || showtimesQuery.isPending;
  const error = moviesQuery.error ?? cinemasQuery.error ?? showtimesQuery.error;
  const showtimes = showtimesQuery.data?.data ?? [];
  const liveShowtimes = showtimes.filter((showtime) => dashboardShowtimeStatus(showtime).tone === "live").length;

  return (
    <AdminPage>
      <div className="admin-breadcrumb"><Link to="/admin">CineBook Admin</Link><span>›</span><strong>Tổng quan</strong></div>
      <div className="admin-dashboard-heading"><div><p className="eyebrow">CINEBOOK CONTROL</p><h1 className="page-title">Tổng quan vận hành</h1><p className="admin-lead">Theo dõi nội dung, cụm rạp và lịch chiếu từ một không gian vận hành tập trung.</p></div><div className="admin-dashboard-actions"><button className="secondary" type="button" onClick={() => { void moviesQuery.refetch(); void cinemasQuery.refetch(); void showtimesQuery.refetch(); }}>↻ Làm mới dữ liệu</button><Link className="primary" to="/admin/showtimes">+ Tạo suất chiếu</Link></div></div>
      {isPending && <LoadingState label="Đang tổng hợp dữ liệu…" />}
      {error && !isPending && <ErrorState cause={error} fallback="Không thể tải tổng quan." onRetry={() => { void moviesQuery.refetch(); void cinemasQuery.refetch(); void showtimesQuery.refetch(); }} />}
      {!isPending && !error && <>
        <div className="admin-stat-grid">
          <Link className="admin-stat-card admin-stat-card-cobalt" to="/admin/movies"><div className="admin-stat-top"><span className="admin-stat-label">Phim trong hệ thống</span><span className="admin-stat-icon">▣</span></div><strong>{moviesQuery.data?.meta.total ?? 0}</strong><span>Quản lý nội dung <b>→</b></span></Link>
          <Link className="admin-stat-card admin-stat-card-neutral" to="/admin/cinemas"><div className="admin-stat-top"><span className="admin-stat-label">Cụm rạp đang quản lý</span><span className="admin-stat-icon">▤</span></div><strong>{cinemasQuery.data?.length ?? 0}</strong><span>Rạp và phòng chiếu <b>→</b></span></Link>
          <Link className="admin-stat-card admin-stat-card-live" to="/admin/showtimes"><div className="admin-stat-top"><span className="admin-stat-label">Suất chiếu đã tải</span><span className="admin-stat-icon">◷</span></div><strong>{showtimesQuery.data?.meta.total ?? 0}</strong><span><i /> {liveShowtimes} suất đang diễn ra</span></Link>
        </div>
        <div className="admin-dashboard-grid">
          <section className="admin-panel admin-operations-panel"><div className="admin-panel-heading"><div><p className="eyebrow">LỊCH VẬN HÀNH</p><h2>Suất chiếu gần đây</h2><small>Trạng thái được tính theo giờ thực tế của suất chiếu.</small></div><Link to="/admin/showtimes">Xem toàn bộ →</Link></div>{showtimes.length === 0 ? <EmptyState>Chưa có suất chiếu để hiển thị.</EmptyState> : <div className="admin-recent-list">{showtimes.slice(0, 6).map((showtime) => { const status = dashboardShowtimeStatus(showtime); return <Link className="admin-recent-row" key={showtime.id} to="/admin/showtimes"><span className="admin-recent-time">{formatTime(showtime.startsAt)}</span><span><strong>{showtime.movie.title}</strong><small>{showtime.room.cinema?.name ?? "Cụm rạp"} · {showtime.room.name}</small></span><span className="admin-recent-date">{formatDate(showtime.startsAt)}</span><span className={`admin-operation-status ${status.tone}`}><i />{status.label}</span></Link>; })}</div>}</section>
          <section className="admin-panel admin-quick-panel"><div className="admin-panel-heading"><div><p className="eyebrow">TÁC VỤ NHANH</p><h2>Không gian điều hành</h2></div><span>{cinemasQuery.data?.length ?? 0} cụm rạp</span></div><div className="admin-quick-links"><Link to="/admin/movies"><span>▣</span><strong>Nội dung phim</strong><small>Quản lý trạng thái phát hành, poster và trailer.</small><b>→</b></Link><Link to="/admin/cinemas"><span>▤</span><strong>Rạp & phòng chiếu</strong><small>Kiểm tra phòng, layout ghế và sức chứa.</small><b>→</b></Link><Link to="/admin/showtimes"><span>◷</span><strong>Lịch vận hành</strong><small>Tạo suất lẻ, bulk schedule và khung giờ trống.</small><b>→</b></Link><Link to="/admin/payments"><span>₫</span><strong>Thanh toán SePay</strong><small>Rà soát giao dịch cần xử lý và hoàn tiền.</small><b>→</b></Link></div></section>
        </div>
      </>}
    </AdminPage>
  );
}

type MovieFormProps = {
  mode: FormMode;
  movie?: Movie;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: CreateMovieRequest) => Promise<void>;
};

type TmdbOperation = {
  kind: "import" | "resync";
  state: "pending" | "success" | "error";
  error?: string;
};

type TmdbSelection = TmdbMovieResponse;

function TmdbMovieModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, TmdbSelection>>(new Map());
  const [operations, setOperations] = useState<Map<number, TmdbOperation>>(new Map());
  const [batch, setBatch] = useState<{ success: number; failed: number } | null>(null);
  const [failedIds, setFailedIds] = useState<number[]>([]);
  const [queuePending, setQueuePending] = useState(false);
  const query = useQuery({
    queryKey: ["tmdb-movies", submittedSearch, page],
    queryFn: ({ signal }) =>
      api.tmdbMovies({ search: submittedSearch || undefined, page }, signal),
    placeholderData: (previous) => previous,
  });
  const movies = query.data?.data ?? [];
  const totalPages = Math.min(query.data?.meta.totalPages ?? 1, 20);
  const selectedIds = [...selected.keys()];
  const currentEligible = movies.filter((movie) => {
    const operation = operations.get(movie.tmdbId);
    return !movie.imported && operation?.state !== "pending";
  });
  const currentSelected = currentEligible.filter((movie) => selected.has(movie.tmdbId));
  const allCurrentSelected = currentEligible.length > 0 && currentSelected.length === currentEligible.length;
  const hasPending = queuePending || [...operations.values()].some((operation) => operation.state === "pending");

  function updateOperation(tmdbId: number, operation: TmdbOperation) {
    setOperations((current) => new Map(current).set(tmdbId, operation));
  }

  function patchImport(response: Awaited<ReturnType<typeof api.importTmdbMovie>>, tmdbId: number) {
    patchTmdbMovieCaches(queryClient, tmdbId, response.movie.id);
    setSelected((current) => {
      const next = new Map(current);
      next.delete(tmdbId);
      return next;
    });
    void queryClient.invalidateQueries({ queryKey: ["admin-movies"] });
  }

  async function importOne(tmdbId: number) {
    updateOperation(tmdbId, { kind: "import", state: "pending" });
    try {
      const response = await api.importTmdbMovie(tmdbId);
      patchImport(response, tmdbId);
      updateOperation(tmdbId, { kind: "import", state: "success" });
      return response;
    } catch (cause) {
      updateOperation(tmdbId, { kind: "import", state: "error", error: mutationMessage(cause) });
      throw cause;
    }
  }

  async function resync(tmdbId: number) {
    updateOperation(tmdbId, { kind: "resync", state: "pending" });
    try {
      await api.resyncTmdbMovie(tmdbId);
      updateOperation(tmdbId, { kind: "resync", state: "success" });
      await queryClient.invalidateQueries({ queryKey: ["admin-movies"] });
      await queryClient.invalidateQueries({ queryKey: ["movies"] });
    } catch (cause) {
      updateOperation(tmdbId, { kind: "resync", state: "error", error: mutationMessage(cause) });
    }
  }

  async function runBatch(ids: number[]) {
    if (!ids.length || hasPending) return;
    setQueuePending(true);
    setBatch(null);
    setFailedIds([]);
    const results = await runTmdbImportQueue(ids, importOne);
    const failed = results.filter((result) => !result.ok).map((result) => result.tmdbId);
    setFailedIds(failed);
    setBatch({ success: results.length - failed.length, failed: failed.length });
    setQueuePending(false);
    await queryClient.invalidateQueries({ queryKey: ["tmdb-movies"] });
  }


  function submitSearch() {
    setSubmittedSearch(searchInput.trim());
    setPage(1);
    setSelected(new Map());
    setBatch(null);
    setFailedIds([]);
  }

  function toggleSelection(movie: TmdbMovieResponse) {
    if (movie.imported || operations.get(movie.tmdbId)?.state === "pending") return;
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(movie.tmdbId)) next.delete(movie.tmdbId);
      else if (next.size < TMDB_IMPORT_LIMIT) next.set(movie.tmdbId, movie);
      return next;
    });
  }

  function toggleCurrentPage() {
    if (allCurrentSelected) {
      setSelected((current) => {
        const next = new Map(current);
        currentEligible.forEach((movie) => next.delete(movie.tmdbId));
        return next;
      });
      return;
    }
    setSelected((current) => {
      const next = new Map(current);
      for (const movie of currentEligible) {
        if (next.size >= TMDB_IMPORT_LIMIT) break;
        next.set(movie.tmdbId, movie);
      }
      return next;
    });
  }

  return (
    <Modal
      eyebrow="THƯ VIỆN TMDB"
      title="Nhập phim từ TMDB"
      onClose={hasPending ? () => undefined : onClose}
      className="tmdb-admin-modal"
    >
      <div className="tmdb-modal">
        <p className="admin-copy">
          Tìm phim đang chiếu hoặc theo tên, sau đó nhập vào hệ thống dưới trạng thái bản nháp để kiểm tra trước khi phát hành.
        </p>
        <form className="tmdb-search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
          <input
            aria-label="Tìm phim TMDB"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm tên phim…"
          />
          <button className="secondary compact-button" type="submit">Tìm kiếm</button>
        </form>
        <div className="tmdb-bulk-toolbar">
          <label className="admin-checkbox">
            <input type="checkbox" checked={allCurrentSelected} onChange={toggleCurrentPage} disabled={!currentEligible.length || hasPending} />
            Chọn trang
          </label>
          <strong>{selectedIds.length} / {TMDB_IMPORT_LIMIT} phim đã chọn</strong>
          <small>Tối đa {TMDB_IMPORT_LIMIT} phim / lần nhập</small>
          <button className="primary compact-button" type="button" disabled={!selectedIds.length || hasPending} onClick={() => void runBatch(selectedIds)}>
            Nhập các phim đã chọn
          </button>
        </div>
        {batch && (
          <div className={`tmdb-batch-summary${batch.failed ? " has-error" : ""}`} role="status">
            <span>Tiến độ nhập: {batch.success} thành công, {batch.failed} lỗi.</span>
            {batch.failed > 0 && <button className="secondary compact-button" type="button" onClick={() => void runBatch(failedIds)}>Thử lại phim lỗi</button>}
          </div>
        )}
        {query.isPending && <LoadingState label="Đang tải danh sách TMDB…" />}
        {query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách TMDB." onRetry={() => void query.refetch()} />}
        {query.isSuccess && !movies.length && <EmptyState>Không tìm thấy phim trên TMDB.</EmptyState>}
        {movies.length > 0 && (
          <div className="tmdb-results">
            {movies.map((movie) => {
              const operation = operations.get(movie.tmdbId);
              const isSelected = selected.has(movie.tmdbId);
              const isPending = operation?.state === "pending";
              return (
                <article className={`tmdb-result${isSelected ? " selected" : ""}`} key={movie.tmdbId}>
                  <label className="tmdb-select" aria-label={`Chọn ${movie.title}`}>
                    <input type="checkbox" checked={isSelected} disabled={movie.imported || isPending || (!isSelected && selected.size >= TMDB_IMPORT_LIMIT)} onChange={() => toggleSelection(movie)} />
                  </label>
                  <div className="tmdb-poster" style={movie.posterUrl ? { backgroundImage: `url("${movie.posterUrl}")` } : undefined}>
                    {movie.posterUrl ? null : movie.title.slice(0, 1)}
                  </div>
                  <div className="tmdb-result-copy">
                    <strong>{movie.title}</strong>
                    <small>{movie.releaseDate || "Chưa có ngày phát hành"} · Điểm {movie.rating?.toFixed(1) ?? "—"}</small>
                    <p>{movie.description || "Chưa có mô tả."}</p>
                    {operation?.state === "error" && <span className="tmdb-row-error" role="alert">{operation.error}</span>}
                    {operation?.state === "success" && operation.kind === "resync" && <span className="tmdb-row-success">Đã đồng bộ trailer.</span>}
                  </div>
                  <div className="tmdb-row-action">
                    {movie.imported ? (
                      <>
                        <span className="tmdb-status success">Đã nhập</span>
                        <button className="secondary compact-button" type="button" disabled={isPending || hasPending && operation?.state !== "pending"} onClick={() => void resync(movie.tmdbId)}>
                          {isPending ? "Đang đồng bộ…" : "Đồng bộ trailer"}
                        </button>
                      </>
                    ) : (
                      <button className="primary compact-button" type="button" disabled={isPending || hasPending} onClick={() => void runBatch([movie.tmdbId])}>
                        {isPending ? "Đang nhập…" : operation?.state === "error" ? "Thử lại" : "Nhập phim"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="tmdb-pagination">
          <button className="secondary compact-button" type="button" disabled={page <= 1 || query.isFetching || hasPending} onClick={() => setPage((current) => current - 1)}>Trước</button>
          <strong>Trang {page} / {totalPages}</strong>
          <button className="secondary compact-button" type="button" disabled={page >= totalPages || query.isFetching || hasPending} onClick={() => setPage((current) => current + 1)}>Sau</button>
        </div>
        <small className="tmdb-attribution">Dữ liệu và hình ảnh phim cung cấp bởi TMDB. CineBook không được TMDB chứng nhận hoặc xác thực.</small>
      </div>
    </Modal>
  );
}

function MovieForm({
  mode,
  movie,
  loading,
  error,
  onCancel,
  onSubmit,
}: MovieFormProps) {
  const [form, setForm] = useState<CreateMovieRequest>({
    title: movie?.title ?? "",
    description: movie?.description ?? "",
    posterUrl: movie?.posterUrl ?? "",
    backdropUrl: movie?.backdropUrl ?? "",
    trailerKey: movie?.trailerKey ?? "",
    releaseDate: movie?.releaseDate?.slice(0, 10) ?? null,
    rating: movie?.rating ?? null,
    genres: movie?.genres ?? [],
    ageRating: movie?.ageRating ?? "",
    duration: movie?.duration ?? 120,
    status: movie?.status ?? "DRAFT",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trailer = youtubeKey(form.trailerKey);
    await onSubmit({
      ...form,
      posterUrl: form.posterUrl || null,
      backdropUrl: form.backdropUrl || null,
      trailerKey: trailer ?? (form.trailerKey?.trim() || null),
      rating: form.rating == null ? null : Number(form.rating),
    });
  }

  return (
    <Modal
      eyebrow={mode === "create" ? "NỘI DUNG MỚI" : "CHỈNH SỬA PHIM"}
      title={mode === "create" ? "Thêm phim" : "Cập nhật phim"}
      onClose={onCancel}
    >
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <div className="admin-form-grid">
          <Field label="Tên phim" wide>
            <input
              required
              maxLength={200}
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </Field>
          <NumberField
            label="Thời lượng (phút)"
            min={1}
            max={600}
            value={form.duration}
            onChange={(duration) => setForm({ ...form, duration })}
          />
          <Field label="Trạng thái">
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as MovieStatus })
              }
            >
              {movieStatuses.map((status) => (
                <option key={status} value={status}>
                  {movieStatusText(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Poster URL" wide>
            <input
              type="url"
              value={form.posterUrl ?? ""}
              onChange={(event) =>
                setForm({ ...form, posterUrl: event.target.value })
              }
              placeholder="https://…"
            />
          </Field>
          <Field label="Backdrop URL" wide>
            <input
              type="url"
              value={form.backdropUrl ?? ""}
              onChange={(event) =>
                setForm({ ...form, backdropUrl: event.target.value })
              }
              placeholder="https://…"
            />
          </Field>
          <Field label="Ngày khởi chiếu">
            <input
              type="date"
              value={form.releaseDate ?? ""}
              onChange={(event) => setForm({ ...form, releaseDate: event.target.value || null })}
            />
          </Field>
          <NumberField
            label="Điểm TMDB"
            min={0}
            max={10}
            step={0.1}
            value={Number(form.rating ?? 0)}
            onChange={(rating) => setForm({ ...form, rating })}
          />
          <Field label="Phân loại độ tuổi">
            <input
              maxLength={20}
              value={form.ageRating ?? ""}
              onChange={(event) => setForm({ ...form, ageRating: event.target.value || null })}
              placeholder="Ví dụ: T13"
            />
          </Field>
          <Field label="Thể loại" wide>
            <input
              value={(form.genres ?? []).join(", ")}
              onChange={(event) => setForm({ ...form, genres: event.target.value.split(",").map((genre) => genre.trim()).filter(Boolean) })}
              placeholder="Ví dụ: Hành động, Khoa học viễn tưởng"
            />
          </Field>
          <Field label="Trailer YouTube" wide>
            <input
              value={form.trailerKey ?? ""}
              onChange={(event) =>
                setForm({ ...form, trailerKey: event.target.value })
              }
              placeholder="Mã video hoặc URL YouTube"
            />
          </Field>
          <CharacterTextarea
            label="Mô tả phim"
            maxLength={5000}
            value={form.description ?? ""}
            onChange={(description) => setForm({ ...form, description })}
            rows={5}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <FormActions
          loading={loading}
          onCancel={onCancel}
          submitLabel={mode === "create" ? "Tạo phim" : "Lưu thay đổi"}
        />
      </form>
    </Modal>
  );
}

export function AdminMoviesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MovieStatus | "">("");
  const [modal, setModal] = useState<{ mode: FormMode; movie?: Movie } | null>(
    null,
  );
  const [tmdbOpen, setTmdbOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const query = useQuery({
    queryKey: ["admin-movies", search, status],
    queryFn: ({ signal }) =>
      api.adminMovies(
        {
          search: search || undefined,
          status: status || undefined,
          pageSize: 100,
        },
        signal,
      ),
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateMovieRequest }) =>
      id
        ? api.updateMovie(id, body as UpdateMovieRequest)
        : api.createMovie(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-movies"] });
      setModal(null);
      setMutationError("");
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.archiveMovie(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-movies"] });
      setConfirm(null);
    },
  });
  const publishMutation = useMutation({
    mutationFn: (movie: Movie) => api.updateMovie(movie.id, { status: "PUBLISHED" }),
    onSuccess: () => {
      setMutationError("");
      void queryClient.invalidateQueries({ queryKey: ["admin-movies"] });
      void queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
    onError: (cause) => setMutationError(mutationMessage(cause)),
  });
  const movies = query.data?.data ?? [];

  async function save(body: CreateMovieRequest) {
    setMutationError("");
    try {
      await saveMutation.mutateAsync({ id: modal?.movie?.id, body });
    } catch (cause) {
      setMutationError(mutationMessage(cause));
    }
  }

  function askArchive(movie: Movie) {
    setConfirm({
      title: "Lưu trữ phim?",
      message: `Phim “${movie.title}” sẽ không còn xuất hiện trong danh mục khách hàng.`,
      onConfirm: () => archiveMutation.mutate(movie.id),
    });
  }

  return (
    <AdminPage>
      <PageHeader eyebrow="QUẢN LÝ NỘI DUNG" title="Phim">
        <div className="admin-page-actions">
          <button
            className="secondary"
            type="button"
            onClick={() => setTmdbOpen(true)}
          >
            Nhập từ TMDB
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setMutationError("");
              setModal({ mode: "create" });
            }}
          >
            + Thêm phim
          </button>
        </div>
      </PageHeader>
      <Toolbar>
        <input
          aria-label="Tìm phim"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo tên phim…"
        />
        <select
          aria-label="Lọc trạng thái"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as MovieStatus | "")
          }
        >
          <option value="">Tất cả trạng thái</option>
          {movieStatuses.map((value) => (
            <option key={value} value={value}>
              {movieStatusText(value)}
            </option>
          ))}
        </select>
      </Toolbar>
      {mutationError && !modal && <p className="form-error">{mutationError}</p>}
      {query.isError && (
        <ErrorState
          cause={query.error}
          fallback="Không thể tải danh sách phim."
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isPending && <LoadingState label="Đang tải danh sách phim…" />}
      {query.isSuccess && !movies.length && (
        <EmptyState>
          {search ? "Không tìm thấy phim phù hợp." : "Chưa có phim để quản lý."}
        </EmptyState>
      )}
      {movies.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Phim</th>
                <th>Thời lượng</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {movies.map((movie) => (
                <tr key={movie.id}>
                  <td>
                    <strong>{movie.title}</strong>
                    <small>{movie.description || "Chưa có mô tả"}</small>
                  </td>
                  <td>{movie.duration} phút</td>
                  <td>
                    <StatusBadge status={movie.status} />
                  </td>
                  <td>{formatDate(movie.updatedAt)}</td>
                  <td>
                    <div className="admin-actions">
                      {movie.status !== "PUBLISHED" && movie.status !== "ARCHIVED" && <button
                        className="primary compact-button"
                        type="button"
                        disabled={publishMutation.isPending}
                        onClick={() => publishMutation.mutate(movie)}
                      >
                        Đưa vào đang chiếu
                      </button>}
                      <button
                        className="secondary compact-button"
                        type="button"
                        onClick={() => {
                          setMutationError("");
                          setModal({ mode: "edit", movie });
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        className="danger compact-button"
                        type="button"
                        disabled={
                          movie.status === "ARCHIVED" ||
                          archiveMutation.isPending
                        }
                        onClick={() => askArchive(movie)}
                      >
                        Lưu trữ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tmdbOpen && <TmdbMovieModal onClose={() => setTmdbOpen(false)} />}
      {modal && (
        <MovieForm
          mode={modal.mode}
          movie={modal.movie}
          loading={saveMutation.isPending}
          error={mutationError}
          onCancel={() => setModal(null)}
          onSubmit={save}
        />
      )}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          loading={archiveMutation.isPending}
          error={
            archiveMutation.error
              ? mutationMessage(archiveMutation.error)
              : undefined
          }
          onClose={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  );
}

type CinemaFormProps = {
  mode: FormMode;
  cinema?: Cinema;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: CreateCinemaRequest) => Promise<void>;
};

function CinemaForm({
  mode,
  cinema,
  loading,
  error,
  onCancel,
  onSubmit,
}: CinemaFormProps) {
  const { provinces, isPending: provincesPending } = useLocationContext();
  const [form, setForm] = useState<CreateCinemaRequest>({
    name: cinema?.name ?? "",
    address: cinema?.address ?? "",
    provinceCode: cinema?.provinceCode ?? 79,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit(form);
  }

  return (
    <Modal
      eyebrow={mode === "create" ? "CỤM RẠP MỚI" : "CHỈNH SỬA CỤM RẠP"}
      title={mode === "create" ? "Thêm cụm rạp" : "Cập nhật cụm rạp"}
      onClose={onCancel}
    >
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <div className="admin-form-grid">
          <Field label="Tên cụm rạp" wide>
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label="Tỉnh/thành" wide>
            <select
              required
              disabled={provincesPending}
              value={form.provinceCode}
              onChange={(event) =>
                setForm({ ...form, provinceCode: Number(event.target.value) })
              }
            >
              {provinces.map((province) => (
                <option key={province.code} value={province.code}>
                  {province.name}
                </option>
              ))}
            </select>
          </Field>
          <CharacterTextarea
            label="Địa chỉ chi tiết"
            required
            maxLength={500}
            rows={4}
            value={form.address}
            onChange={(address) => setForm({ ...form, address })}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <FormActions
          loading={loading}
          onCancel={onCancel}
          submitLabel={mode === "create" ? "Tạo cụm rạp" : "Lưu thay đổi"}
        />
      </form>
    </Modal>
  );
}

export function AdminCinemasPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{
    mode: FormMode;
    cinema?: Cinema;
  } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [search, setSearch] = useState("");
  const [provinceCode, setProvinceCode] = useState<number | "">("");
  const { provinces, isPending: provincesPending, isError: provincesError, refetch: refetchProvinces } = useLocationContext();
  const query = useQuery({
    queryKey: ["admin-cinemas", provinceCode],
    queryFn: ({ signal }) => api.cinemas(provinceCode === "" ? undefined : provinceCode, signal),
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateCinemaRequest }) =>
      id
        ? api.updateCinema(id, body as UpdateCinemaRequest)
        : api.createCinema(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] });
      setModal(null);
      setMutationError("");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCinema(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] });
      setConfirm(null);
    },
  });
  const cinemas = query.data ?? [];
  const filteredCinemas = cinemas.filter((cinema) => `${cinema.name} ${cinema.address} ${cinema.province?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function save(body: CreateCinemaRequest) {
    setMutationError("");
    try {
      await saveMutation.mutateAsync({ id: modal?.cinema?.id, body });
    } catch (cause) {
      setMutationError(mutationMessage(cause));
    }
  }

  function askDelete(cinema: Cinema) {
    setConfirm({
      title: "Xóa cụm rạp?",
      message: `Thao tác này sẽ xóa “${cinema.name}” nếu cụm rạp chưa có dữ liệu liên quan.`,
      onConfirm: () => deleteMutation.mutate(cinema.id),
    });
  }

  return (
    <AdminPage>
      <PageHeader eyebrow="MẠNG LƯỚI CINEBOOK" title="Cụm rạp">
        <button
          className="primary"
          type="button"
          onClick={() => {
            setMutationError("");
            setModal({ mode: "create" });
          }}
        >
          + Thêm cụm rạp
        </button>
      </PageHeader>
      {query.isError && (
        <ErrorState
          cause={query.error}
          fallback="Không thể tải danh sách cụm rạp."
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isPending && <LoadingState label="Đang tải danh sách cụm rạp…" />}
      {query.isSuccess && !cinemas.length && (
        <EmptyState>Chưa có cụm rạp. Hãy tạo cụm rạp đầu tiên.</EmptyState>
      )}
      <div className="admin-toolbar admin-cinema-toolbar">
        <input aria-label="Tìm cụm rạp" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên cụm rạp hoặc địa chỉ…" />
        <select aria-label="Lọc tỉnh thành" value={provinceCode} disabled={provincesPending} onChange={(event) => setProvinceCode(event.target.value ? Number(event.target.value) : "")}>
          <option value="">Tất cả tỉnh/thành</option>
          {provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}
        </select>
        <span className="admin-toolbar-result">{filteredCinemas.length} cụm rạp</span>
      </div>
      {provincesError && <ErrorState cause={new Error("Province list unavailable")} fallback="Không thể tải bộ lọc tỉnh/thành." onRetry={() => void refetchProvinces()} />}
      {query.isSuccess && !filteredCinemas.length && <EmptyState>{search || provinceCode !== "" ? "Không tìm thấy cụm rạp phù hợp." : "Chưa có cụm rạp. Hãy tạo cụm rạp đầu tiên."}</EmptyState>}
      {filteredCinemas.length > 0 && (
        <div className="admin-card-grid">
          {filteredCinemas.map((cinema, index) => (
            <article className="admin-entity-card" key={cinema.id}>
              <div className="admin-card-mark">{cinema.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase()}</div>
              <div className="admin-entity-content">
                <div className="admin-card-heading">
                  <div><p className="eyebrow">CỤM RẠP {String(index + 1).padStart(2, "0")}</p><h2>{cinema.name}</h2></div>
                  <span className="admin-count">{cinema.roomCount ?? 0} phòng</span>
                </div>
                <div className="admin-card-tags"><span>{cinema.province?.name ?? `Mã tỉnh ${cinema.provinceCode}`}</span><span className="admin-card-status">Đang quản lý</span></div>
                <p className="admin-address">⌖ {cinema.address}</p>
                <div className="admin-card-footer"><Link className="primary" to={`/admin/cinemas/${cinema.id}/rooms`}>Quản lý phòng</Link><button className="secondary" type="button" onClick={() => { setMutationError(""); setModal({ mode: "edit", cinema }); }}>Sửa</button><button className="danger" type="button" disabled={deleteMutation.isPending} onClick={() => askDelete(cinema)}>Xóa</button></div>
              </div>
            </article>
          ))}
        </div>
      )}
      {modal && (
        <CinemaForm
          mode={modal.mode}
          cinema={modal.cinema}
          loading={saveMutation.isPending}
          error={mutationError}
          onCancel={() => setModal(null)}
          onSubmit={save}
        />
      )}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          loading={deleteMutation.isPending}
          error={
            deleteMutation.error
              ? mutationMessage(deleteMutation.error)
              : undefined
          }
          onClose={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  );
}

type RoomFormProps = {
  mode: FormMode;
  cinemaId: string;
  room?: RoomResponse;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: CreateRoomRequest) => Promise<void>;
};

function RoomForm({
  mode,
  cinemaId,
  room,
  loading,
  error,
  onCancel,
  onSubmit,
}: RoomFormProps) {
  const [name, setName] = useState(room?.name ?? "");
  const [format, setFormat] = useState(room?.format ?? "STANDARD");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ name, cinemaId, format });
  }

  return (
    <Modal
      eyebrow={mode === "create" ? "PHÒNG CHIẾU MỚI" : "CHỈNH SỬA PHÒNG"}
      title={mode === "create" ? "Thêm phòng chiếu" : "Cập nhật phòng chiếu"}
      onClose={onCancel}
    >
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <Field label="Tên phòng chiếu">
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Định dạng phòng">
          <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
            {roomFormats.map((value) => <option key={value} value={value}>{roomFormatText[value]}</option>)}
          </select>
        </Field>
        {error && <p className="form-error">{error}</p>}
        <FormActions
          loading={loading}
          onCancel={onCancel}
          submitLabel={mode === "create" ? "Tạo phòng" : "Lưu thay đổi"}
        />
      </form>
    </Modal>
  );
}

export function AdminRoomsPage() {
  const { cinemaId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{
    mode: FormMode;
    room?: RoomResponse;
  } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const cinemaQuery = useQuery({
    queryKey: ["admin-cinema", cinemaId],
    queryFn: ({ signal }) => api.cinema(cinemaId!, signal),
    enabled: Boolean(cinemaId),
  });
  const roomsQuery = useQuery({
    queryKey: ["admin-rooms", cinemaId],
    queryFn: ({ signal }) => api.rooms(cinemaId!, signal),
    enabled: Boolean(cinemaId),
  });
  const roomDetailQuery = useQuery({
    queryKey: ["admin-room", modal?.room?.id],
    queryFn: ({ signal }) => api.room(modal!.room!.id, signal),
    enabled: Boolean(modal?.room?.id),
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateRoomRequest }) =>
      id ? api.updateRoom(id, { name: body.name, format: body.format }) : api.createRoom(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-rooms", cinemaId],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] });
      setModal(null);
      setMutationError("");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRoom(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-rooms", cinemaId],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] });
      setConfirm(null);
    },
  });
  const rooms = roomsQuery.data ?? [];
  const selectedRoom = roomDetailQuery.data ?? modal?.room;

  async function save(body: CreateRoomRequest) {
    setMutationError("");
    try {
      await saveMutation.mutateAsync({ id: modal?.room?.id, body });
    } catch (cause) {
      setMutationError(mutationMessage(cause));
    }
  }

  function askDelete(room: RoomResponse) {
    setConfirm({
      title: "Xóa phòng chiếu?",
      message: `Phòng “${room.name}” chỉ có thể xóa khi chưa có suất chiếu liên quan.`,
      onConfirm: () => deleteMutation.mutate(room.id),
    });
  }

  if (!cinemaId)
    return (
      <AdminPage>
        <ErrorState
          cause={new Error("Thiếu cụm rạp")}
          fallback="Không xác định được cụm rạp."
          onRetry={() => navigate("/admin/cinemas")}
        />
      </AdminPage>
    );

  return (
    <AdminPage>
      <div className="admin-breadcrumb">
        <Link to="/admin/cinemas">Cụm rạp</Link>
        <span>›</span>
        <strong>{cinemaQuery.data?.name ?? "Phòng chiếu"}</strong>
      </div>
      <PageHeader
        eyebrow="VẬN HÀNH CỤM RẠP"
        title={cinemaQuery.data?.name ?? "Phòng chiếu"}
      >
        <button
          className="primary"
          type="button"
          onClick={() => {
            setMutationError("");
            setModal({ mode: "create" });
          }}
        >
          + Thêm phòng
        </button>
      </PageHeader>
      <p className="admin-lead">
        {cinemaQuery.data?.address ?? "Quản lý tên phòng và sơ đồ ghế."}
      </p>
      {cinemaQuery.isError && (
        <ErrorState
          cause={cinemaQuery.error}
          fallback="Không thể tải thông tin cụm rạp."
          onRetry={() => void cinemaQuery.refetch()}
        />
      )}
      {roomsQuery.isError && (
        <ErrorState
          cause={roomsQuery.error}
          fallback="Không thể tải danh sách phòng."
          onRetry={() => void roomsQuery.refetch()}
        />
      )}
      {roomsQuery.isPending && (
        <LoadingState label="Đang tải danh sách phòng…" />
      )}
      {roomsQuery.isSuccess && !rooms.length && (
        <EmptyState>Cụm rạp này chưa có phòng chiếu.</EmptyState>
      )}
      {rooms.length > 0 && (
        <div className="admin-room-list">
          {rooms.map((room) => (
            <article className="admin-room-row" key={room.id}>
              <div>
                <p className="eyebrow">PHÒNG CHIẾU</p>
                <h2>{room.name}</h2>
                <span className="admin-room-format">{roomFormatText[room.format]} · {room.seatCount ?? room.seats?.length ?? 0} ghế</span>
                <span>
                  Cập nhật {formatDate(room.updatedAt)}
                </span>
              </div>
              <div className="admin-actions">
                <Link
                  className="primary compact-button"
                  to={`/admin/rooms/${room.id}/seats`}
                >
                  Sơ đồ ghế
                </Link>
                <button
                  className="secondary compact-button"
                  type="button"
                  onClick={() => {
                    setMutationError("");
                    setModal({ mode: "edit", room });
                  }}
                >
                  Sửa
                </button>
                <button
                  className="danger compact-button"
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => askDelete(room)}
                >
                  Xóa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {modal && modal.mode === "create" && (
        <RoomForm
          mode="create"
          cinemaId={cinemaId}
          loading={saveMutation.isPending}
          error={mutationError}
          onCancel={() => setModal(null)}
          onSubmit={save}
        />
      )}
      {modal && modal.mode === "edit" && roomDetailQuery.isPending && (
        <Modal
          eyebrow="CHI TIẾT PHÒNG"
          title="Đang tải phòng chiếu"
          onClose={() => setModal(null)}
        >
          <LoadingState label="Đang tải chi tiết phòng…" />
        </Modal>
      )}
      {modal && modal.mode === "edit" && roomDetailQuery.isError && (
        <Modal
          eyebrow="CHI TIẾT PHÒNG"
          title="Không thể tải phòng chiếu"
          onClose={() => setModal(null)}
        >
          <ErrorState
            cause={roomDetailQuery.error}
            fallback="Không thể tải chi tiết phòng."
            onRetry={() => void roomDetailQuery.refetch()}
          />
        </Modal>
      )}
      {modal &&
        modal.mode === "edit" &&
        roomDetailQuery.isSuccess &&
        selectedRoom && (
          <RoomForm
            mode="edit"
            cinemaId={cinemaId}
            room={selectedRoom}
            loading={saveMutation.isPending}
            error={mutationError}
            onCancel={() => setModal(null)}
            onSubmit={save}
          />
        )}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          loading={deleteMutation.isPending}
          error={
            deleteMutation.error
              ? mutationMessage(deleteMutation.error)
              : undefined
          }
          onClose={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  );
}

type SeatFormProps = {
  seat?: Seat;
  loading: boolean;
  error?: string;
  onSubmit: (body: CreateSeatRequest) => Promise<void>;
  onCancel: () => void;
};

function SeatForm({ seat, loading, error, onSubmit, onCancel }: SeatFormProps) {
  const [row, setRow] = useState(seat?.row ?? "A");
  const [number, setNumber] = useState(seat?.number ?? 1);
  const [type, setType] = useState<SeatType>(seat?.type === "VIP" ? "VIP" : "STANDARD");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ row: row.toUpperCase(), number, type });
  }

  return (
    <Modal
      eyebrow={seat ? "CHỈNH SỬA GHẾ" : "GHẾ MỚI"}
      title={seat ? `Ghế ${seat.row}${seat.number}` : "Thêm ghế"}
      onClose={onCancel}
    >
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <div className="admin-form-grid">
          <Field label="Hàng">
            <input
              required
              maxLength={3}
              value={row}
              onChange={(event) => setRow(event.target.value)}
            />
          </Field>
          <NumberField
            label="Số ghế"
            min={1}
            max={100}
            value={number}
            onChange={setNumber}
          />
          <Field label="Loại ghế">
            <select
              value={type}
              onChange={(event) => setType(event.target.value as SeatType)}
            >
              {editableSeatTypes.map((value) => (
                <option key={value} value={value}>
                  {seatTypeText(value)}
                </option>
              ))}
            </select>
          </Field>
          <p className="form-hint">Ghế đôi phải được tạo theo cặp bằng chức năng tạo nhanh sơ đồ.</p>
        </div>
        {error && <p className="form-error">{error}</p>}
        <FormActions
          loading={loading}
          onCancel={onCancel}
          submitLabel={seat ? "Lưu thay đổi" : "Tạo ghế"}
        />
      </form>
    </Modal>
  );
}

export function AdminSeatsPage() {
  const { roomId } = useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Seat | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [rows, setRows] = useState(6);
  const [regularColumns, setRegularColumns] = useState(7);
  const [coupleColumns, setCoupleColumns] = useState(8);
  const roomQuery = useQuery({
    queryKey: ["admin-room", roomId],
    queryFn: ({ signal }) => api.room(roomId!, signal),
    enabled: Boolean(roomId),
  });
  const seatsQuery = useQuery({
    queryKey: ["admin-seats", roomId],
    queryFn: ({ signal }) => api.seats(roomId!, signal),
    enabled: Boolean(roomId),
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateSeatRequest }) =>
      id
        ? api.updateSeat(id, { type: body.type })
        : api.createSeat(roomId!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-seats", roomId] });
      setEditing(null);
      setMutationError("");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSeat(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-seats", roomId] });
      setConfirm(null);
    },
  });
  const layoutMutation = useMutation({
    mutationFn: (layout: CreateSeatRequest[]) =>
      api.replaceSeatLayout(roomId!, layout),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-seats", roomId] });
      setConfirm(null);
    },
  });
  const seats = seatsQuery.data ?? emptySeats;
  const completeLayout = isCompleteSeatLayout(seats);
  const groupedSeats = useMemo(
    () =>
      seats.reduce<Record<string, Seat[]>>((groups, seat) => {
        groups[seat.row] = [...(groups[seat.row] ?? []), seat];
        return groups;
      }, {}),
    [seats],
  );

  async function save(body: CreateSeatRequest) {
    setMutationError("");
    try {
      await saveMutation.mutateAsync({ id: editing?.id, body });
    } catch (cause) {
      setMutationError(mutationMessage(cause));
    }
  }

  function makeLayout() {
    return buildSeatLayout({ rows, regularColumns, coupleColumns });
  }

  function askLayout() {
    const validationError = validateSeatPreset({ rows, regularColumns, coupleColumns });
    if (validationError) {
      setMutationError(validationError);
      return;
    }
    setConfirm({
      title: "Thay thế toàn bộ sơ đồ?",
      message: `Sơ đồ gồm ${rows} hàng; ${regularColumns} ghế Standard/VIP và ${coupleColumns} ghế Couple ở hàng cuối.`,
      onConfirm: () => layoutMutation.mutate(makeLayout()),
    });
  }

  function askDelete(seat: Seat) {
    if (completeLayout) {
      setMutationError('Layout hoàn chỉnh chỉ được thay đổi bằng chức năng bulk layout.');
      return;
    }
    setConfirm({
      title: "Xóa ghế?",
      message: `Ghế ${seat.row}${seat.number} sẽ được xóa khỏi phòng chiếu.`,
      onConfirm: () => deleteMutation.mutate(seat.id),
    });
  }

  if (!roomId)
    return (
      <AdminPage>
        <ErrorState
          cause={new Error("Thiếu phòng")}
          fallback="Không xác định được phòng chiếu."
        />
      </AdminPage>
    );

  return (
    <AdminPage>
      <div className="admin-breadcrumb">
        <Link to="/admin/cinemas">Cụm rạp</Link>
        <span>›</span>
        <strong>{roomQuery.data?.name ?? "Sơ đồ ghế"}</strong>
      </div>
      <PageHeader
        eyebrow="SƠ ĐỒ GHẾ"
        title={roomQuery.data?.name ?? "Phòng chiếu"}
      >
        <button
          className="primary"
          type="button"
          disabled={completeLayout}
          onClick={() => {
            setMutationError("");
            setEditing({
              id: "",
              row: "A",
              number: 1,
              type: "STANDARD",
              roomId,
            });
          }}
        >
          + Thêm ghế
        </button>
      </PageHeader>
      {roomQuery.isError && (
        <ErrorState
          cause={roomQuery.error}
          fallback="Không thể tải thông tin phòng."
          onRetry={() => void roomQuery.refetch()}
        />
      )}
      <div className="admin-seat-layout">
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">BULK LAYOUT</p>
              <h2>Tạo nhanh sơ đồ</h2>
            </div>
            <span>{seats.length} ghế hiện tại</span>
          </div>
          <div className="admin-form-grid">
             <NumberField label="Số hàng" min={5} max={26} value={rows} onChange={setRows} />
             <NumberField label="Ghế Standard/VIP" min={1} max={100} value={regularColumns} onChange={setRegularColumns} />
             <NumberField label="Ghế Couple (hàng cuối)" min={2} max={100} step={2} value={coupleColumns} onChange={setCoupleColumns} />
          </div>
          <button
            className="secondary"
            type="button"
            disabled={layoutMutation.isPending || rows < 5 || regularColumns < 1 || coupleColumns < 2 || coupleColumns % 2 !== 0}
            onClick={askLayout}
          >
            {layoutMutation.isPending ? "Đang cập nhật…" : "Thay thế sơ đồ"}
          </button>
        </div>
        {seatsQuery.isError && (
          <ErrorState
            cause={seatsQuery.error}
            fallback="Không thể tải sơ đồ ghế."
            onRetry={() => void seatsQuery.refetch()}
          />
        )}
        {seatsQuery.isPending && <LoadingState label="Đang tải sơ đồ ghế…" />}
        {seatsQuery.isSuccess && !seats.length && (
          <EmptyState>
            Phòng chiếu chưa có ghế. Tạo nhanh một sơ đồ ở trên.
          </EmptyState>
        )}
        {seats.length > 0 && (
          <div className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="eyebrow">SEAT MAP</p>
                <h2>Sơ đồ đang dùng</h2>
              </div>
              <span>Chọn một ghế để chỉnh sửa</span>
            </div>
            <div className="admin-seat-map">
              {Object.entries(groupedSeats)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([row, rowSeats]) => (
                  <div className="admin-seat-row" key={row}>
                    <b>{row}</b>
                    {rowSeats
                      .sort((a, b) => a.number - b.number)
                      .map((seat) => (
                        <button
                          className={`admin-seat admin-seat-${seat.type.toLowerCase()}`}
                          type="button"
                          key={seat.id}
                          onClick={() => {
                            if (completeLayout || seat.type === "COUPLE") return;
                            setMutationError("");
                            setEditing(seat);
                          }}
                        >
                          {seat.number}
                          <span>
                            {seat.type === "VIP"
                              ? "V"
                              : seat.type === "COUPLE"
                                ? "Đ"
                                : ""}
                          </span>
                        </button>
                      ))}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
      {seats.length > 0 && (
        <section className="admin-seat-actions">
          <div className="admin-seat-actions-heading">
            <div>
              <p className="eyebrow">THAO TÁC GHẾ</p>
              <h2>Danh sách ghế</h2>
              <p>Chọn ghế trên sơ đồ để chỉnh sửa nhanh hoặc quản lý từng vị trí tại đây.</p>
            </div>
            <span className="admin-count">{seats.length} vị trí</span>
          </div>
          <div className="admin-seat-legend">
            {seatTypes.map((type) => <span key={type}><i className={`admin-seat-dot admin-seat-dot-${type.toLowerCase()}`} />{seatTypeText(type)}</span>)}
          </div>
          <div className="admin-seat-delete-list">
            {seats.slice().sort((a, b) => `${a.row}${a.number}`.localeCompare(`${b.row}${b.number}`, undefined, { numeric: true })).map((seat) => (
              <div key={seat.id} className="admin-seat-action-row">
                <span className={`admin-seat-token admin-seat-token-${seat.type.toLowerCase()}`}>{seat.row}{seat.number}</span>
                  <span className="admin-seat-action-copy"><strong>Ghế {seat.row}{seat.number}</strong><small>{seatTypeText(seat.type)}</small></span>
                  {completeLayout || seat.type === "COUPLE" ? (
                    <span className="admin-seat-managed">Theo layout</span>
                  ) : (
                    <>
                      <button className="secondary compact-button" type="button" onClick={() => { setMutationError(""); setEditing(seat); }}>Sửa</button>
                      <button className="danger compact-button" type="button" disabled={deleteMutation.isPending} onClick={() => askDelete(seat)}>Xóa</button>
                    </>
                  )}
              </div>
            ))}
          </div>
        </section>
      )}
      {editing && (
        <SeatForm
          seat={editing.id ? editing : undefined}
          loading={saveMutation.isPending}
          error={mutationError}
          onCancel={() => setEditing(null)}
          onSubmit={save}
        />
      )}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          loading={deleteMutation.isPending || layoutMutation.isPending}
          error={
            deleteMutation.error
              ? mutationMessage(deleteMutation.error)
              : layoutMutation.error
                ? mutationMessage(layoutMutation.error)
                : undefined
          }
          onClose={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  );
}

type ShowtimeFormProps = {
  mode: FormMode;
  showtime?: Showtime;
  movies: Movie[];
  cinemas: Cinema[];
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: CreateShowtimeRequest | UpdateShowtimeRequest) => Promise<void>;
};

function localDateTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)).replace(" ", "T");
}

function vietnameseDateTime(value: string) {
  return `${value}:00+07:00`;
}

function isWithinVenueHours(localValue: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(vietnameseDateTime(localValue))),
  );
  return hour >= 8 && hour <= 23;
}

function slotConflictLabel(slot: BulkShowtimePreviewResponse["slots"][number]) {
  if (slot.available) return "";
  if (slot.reasonCode === "SHOWTIME_OUTSIDE_HOURS") {
    return " · Ngoài giờ vận hành (08:00–23:00)";
  }
  const slotDay = vnDay(slot.startsAt);
  const ranges = (slot.conflicts ?? []).map((conflict) => {
    const range = `${formatTime(conflict.startsAt)} – ${formatTime(conflict.endsAt)}`;
    return vnDay(conflict.startsAt) === slotDay
      ? range
      : `${formatDate(conflict.startsAt)} ${range}`;
  });
  return ranges.length ? ` · Trùng với suất ${ranges.join(", ")}` : " · Trùng lịch chiếu";
}

function vnDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function ShowtimeForm({
  mode,
  showtime,
  movies,
  cinemas,
  loading,
  error,
  onCancel,
  onSubmit,
}: ShowtimeFormProps) {
  const [movieId, setMovieId] = useState(showtime?.movieId ?? "");
  const [cinemaId, setCinemaId] = useState(showtime?.room.cinemaId ?? "");
  const [roomId, setRoomId] = useState(showtime?.roomId ?? "");
  const [startsAt, setStartsAt] = useState(localDateTime(showtime?.startsAt));
  const [format, setFormat] = useState(showtime?.format ?? "TWO_D_SUBTITLED");
  const selectedMovie = movies.find((movie) => movie.id === movieId);
  const calculatedEndsAt = startsAt && selectedMovie
    ? new Date(new Date(vietnameseDateTime(startsAt)).getTime() + selectedMovie.duration * 60 * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" })
    : "Chọn phim và giờ bắt đầu";
  const initialPricing = {
    basePrice: showtime?.basePrice != null ? Number(showtime.basePrice) : 100000,
    vipMultiplier: showtime?.vipMultiplier != null ? Number(showtime.vipMultiplier) : 1.1,
    coupleMultiplier: showtime?.coupleMultiplier != null ? Number(showtime.coupleMultiplier) : 1.2,
  };
  const [basePrice, setBasePrice] = useState(initialPricing.basePrice);
  const [vipMultiplier, setVipMultiplier] = useState(initialPricing.vipMultiplier);
  const [coupleMultiplier, setCoupleMultiplier] = useState(initialPricing.coupleMultiplier);
  const [pricingTouched, setPricingTouched] = useState({
    basePrice: false,
    vipMultiplier: false,
    coupleMultiplier: false,
  });
  const roomsQuery = useQuery({
    queryKey: ["admin-showtime-rooms", cinemaId],
    queryFn: ({ signal }) => api.rooms(cinemaId, signal),
    enabled: Boolean(cinemaId),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "create") {
      await onSubmit({
        movieId,
        roomId,
        startsAt: vietnameseDateTime(startsAt),
        format,
        basePrice,
        vipMultiplier,
        coupleMultiplier,
      });
      return;
    }
    await onSubmit({
      movieId,
      roomId,
      startsAt: vietnameseDateTime(startsAt),
      format,
      ...(pricingTouched.basePrice && { basePrice }),
      ...(pricingTouched.vipMultiplier && { vipMultiplier }),
      ...(pricingTouched.coupleMultiplier && { coupleMultiplier }),
    });
  }

  return (
    <Modal
      eyebrow={mode === "create" ? "LỊCH CHIẾU MỚI" : "CHỈNH SỬA LỊCH CHIẾU"}
      title={mode === "create" ? "Thêm suất chiếu" : "Cập nhật suất chiếu"}
      onClose={onCancel}
    >
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <div className="admin-form-grid">
          <Field label="Phim" wide>
            <select
              required
              value={movieId}
              onChange={(event) => setMovieId(event.target.value)}
            >
              <option value="">Chọn phim</option>
              {movies
                .filter((movie) => movie.status === "PUBLISHED")
                .map((movie) => (
                  <option key={movie.id} value={movie.id}>
                    {movie.title}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Cụm rạp" wide>
            <select
              required
              value={cinemaId}
              onChange={(event) => {
                setCinemaId(event.target.value);
                setRoomId("");
              }}
            >
              <option value="">Chọn cụm rạp</option>
              {cinemas.map((cinema) => (
                <option key={cinema.id} value={cinema.id}>
                  {cinema.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phòng chiếu" wide>
            <select
              required
              disabled={!cinemaId || roomsQuery.isPending}
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
            >
              <option value="">
                {roomsQuery.isPending ? "Đang tải phòng…" : "Chọn phòng"}
              </option>
              {(roomsQuery.data ?? []).map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} · {roomFormatText[room.format]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Định dạng suất chiếu">
            <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
              {showtimeFormats.map((value) => <option key={value} value={value}>{showtimeFormatText[value]}</option>)}
            </select>
          </Field>
          <Field label="Bắt đầu">
            <input
              required
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
            {startsAt && !isWithinVenueHours(startsAt) && (
              <small className="form-hint-warning">Suất chiếu chỉ được bắt đầu từ 08:00 đến 23:00 hằng ngày (giờ Việt Nam).</small>
            )}
          </Field>
          <Field label="Kết thúc (tự tính theo thời lượng phim)">
            <input type="text" value={calculatedEndsAt} readOnly />
          </Field>
          <NumberField label="Giá cơ bản" min={0} step={1000} value={basePrice} onChange={(value) => { setBasePrice(value); setPricingTouched((current) => ({ ...current, basePrice: true })); }} />
          <NumberField label="Hệ số VIP" min={0} step={0.01} value={vipMultiplier} onChange={(value) => { setVipMultiplier(value); setPricingTouched((current) => ({ ...current, vipMultiplier: true })); }} />
          <NumberField label="Phụ phí ghế đôi trên giá VIP" min={0} step={0.01} value={coupleMultiplier} onChange={(value) => { setCoupleMultiplier(value); setPricingTouched((current) => ({ ...current, coupleMultiplier: true })); }} />
        </div>
        {roomsQuery.isError && (
          <p className="form-error">Không thể tải phòng chiếu của cụm rạp.</p>
        )}
        {error && <p className="form-error">{error}</p>}
        <FormActions
          loading={loading}
          onCancel={onCancel}
          submitLabel={mode === "create" ? "Tạo suất chiếu" : "Lưu thay đổi"}
        />
      </form>
    </Modal>
  );
}

type BulkShowtimeFormProps = {
  movies: Movie[];
  cinemas: Cinema[];
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: BulkShowtimeRequest) => Promise<void>;
};

function BulkShowtimeForm({ movies, cinemas, loading, error, onCancel, onSubmit }: BulkShowtimeFormProps) {
  const [movieId, setMovieId] = useState("");
  const [cinemaId, setCinemaId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [format, setFormat] = useState<(typeof showtimeFormats)[number]>("TWO_D_SUBTITLED");
  const [firstStartsAt, setFirstStartsAt] = useState("");
  const [count, setCount] = useState(5);
  const [turnaroundMinutes, setTurnaroundMinutes] = useState(20);
  const [basePrice, setBasePrice] = useState(100000);
  const [vipMultiplier, setVipMultiplier] = useState(1.1);
  const [coupleMultiplier, setCoupleMultiplier] = useState(1.2);
  const [preview, setPreview] = useState<BulkShowtimePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [freeDate, setFreeDate] = useState(() => localDateTime(new Date().toISOString()).slice(0, 10));
  const [freeSlots, setFreeSlots] = useState<FreeSlotsResponse | null>(null);
  const [freeLoading, setFreeLoading] = useState(false);
  const [freeError, setFreeError] = useState("");
  const selectedBulkMovie = movies.find((movie) => movie.id === movieId);
  const roomsQuery = useQuery({
    queryKey: ["admin-bulk-showtime-rooms", cinemaId],
    queryFn: ({ signal }) => api.rooms(cinemaId, signal),
    enabled: Boolean(cinemaId),
  });
  const body: BulkShowtimeRequest = {
    movieId,
    roomId,
    firstStartsAt: firstStartsAt ? vietnameseDateTime(firstStartsAt) : "",
    format,
    count,
    turnaroundMinutes,
    basePrice,
    vipMultiplier,
    coupleMultiplier,
  };

  async function previewSlots() {
    setPreviewError("");
    setPreview(null);
    setPreviewLoading(true);
    try {
      setPreview(await api.previewBulkShowtimes(body));
    } catch (cause) {
      setPreviewError(mutationMessage(cause));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview?.valid) {
      await previewSlots();
      return;
    }
    await onSubmit(body);
  }

  async function loadFreeSlots() {
    if (!roomId || !selectedBulkMovie) return;
    setFreeError("");
    setFreeSlots(null);
    setFreeLoading(true);
    try {
      setFreeSlots(
        await api.roomFreeSlots(roomId, {
          date: freeDate,
          durationMinutes: selectedBulkMovie.duration,
          turnaroundMinutes,
        }),
      );
    } catch (cause) {
      setFreeError(errorMessage(cause, "Không thể tải khung giờ trống."));
    } finally {
      setFreeLoading(false);
    }
  }

  return (
    <Modal eyebrow="LẬP LỊCH HÀNG LOẠT" title="Tạo nhiều suất chiếu" onClose={onCancel} className="bulk-showtime-modal">
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <div className="admin-form-grid">
          <Field label="Phim" wide>
            <select required value={movieId} onChange={(event) => { setMovieId(event.target.value); setPreview(null); }}>
              <option value="">Chọn phim đã phát hành</option>
              {movies.filter((movie) => movie.status === "PUBLISHED").map((movie) => <option key={movie.id} value={movie.id}>{movie.title} · {movie.duration} phút</option>)}
            </select>
          </Field>
          <Field label="Cụm rạp" wide>
            <select required value={cinemaId} onChange={(event) => { setCinemaId(event.target.value); setRoomId(""); setPreview(null); }}>
              <option value="">Chọn cụm rạp</option>
              {cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}
            </select>
          </Field>
          <Field label="Phòng chiếu" wide>
            <select required disabled={!cinemaId || roomsQuery.isPending} value={roomId} onChange={(event) => { setRoomId(event.target.value); setPreview(null); setFreeSlots(null); }}>
              <option value="">{roomsQuery.isPending ? "Đang tải phòng…" : "Chọn phòng"}</option>
              {(roomsQuery.data ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </Field>
          <Field label="Định dạng suất chiếu">
            <select value={format} onChange={(event) => { setFormat(event.target.value as typeof format); setPreview(null); }}>
              {showtimeFormats.map((value) => <option key={value} value={value}>{showtimeFormatText[value]}</option>)}
            </select>
          </Field>
          <Field label="Suất đầu tiên (giờ Việt Nam)">
            <input required type="datetime-local" value={firstStartsAt} onChange={(event) => { setFirstStartsAt(event.target.value); setPreview(null); }} />
          </Field>
          <NumberField label="Số suất" min={1} max={100} value={count} onChange={(value) => { setCount(value); setPreview(null); }} />
          <NumberField label="Thời gian nghỉ (phút)" min={0} max={180} value={turnaroundMinutes} onChange={(value) => { setTurnaroundMinutes(value); setPreview(null); }} />
          <NumberField label="Giá cơ bản" min={0} step={1000} value={basePrice} onChange={setBasePrice} />
          <NumberField label="Hệ số VIP" min={0} step={0.01} value={vipMultiplier} onChange={setVipMultiplier} />
          <NumberField label="Hệ số ghế đôi" min={0} step={0.01} value={coupleMultiplier} onChange={setCoupleMultiplier} />
        </div>
        {(roomsQuery.isError || previewError || error) && <p className="form-error">{previewError || error || "Không thể tải phòng chiếu."}</p>}
        <div className="free-slots-box">
          <div className="free-slots-head">
            <strong>Khung giờ trống của phòng</strong>
            <span>Rạp mở cửa 08:00 – 23:00 hằng ngày · Bấm vào khung giờ để dùng làm suất đầu tiên</span>
          </div>
          <div className="free-slots-controls">
            <input type="date" aria-label="Ngày xem khung trống" value={freeDate} onChange={(event) => { setFreeDate(event.target.value); setFreeSlots(null); }} />
            <button className="secondary" type="button" disabled={!roomId || !selectedBulkMovie || freeLoading} onClick={() => void loadFreeSlots()}>{freeLoading ? "Đang tìm…" : "Xem khung giờ trống"}</button>
          </div>
          {freeError && <p className="form-error">{freeError}</p>}
          {freeSlots && (freeSlots.freeWindows.length ? <div className="free-slots-list">{freeSlots.freeWindows.map((window) => <button key={window.startsAt} type="button" className="free-slot-chip" onClick={() => { setFirstStartsAt(localDateTime(window.startsAt)); setPreview(null); }}>{formatTime(window.startsAt)} – {formatTime(window.endsAt)} · trống {window.minutes} phút</button>)}</div> : <p className="free-slots-empty">Phòng kín lịch trong ngày đã chọn.</p>)}
          {freeSlots && freeSlots.busy.length > 0 && <p className="free-slots-busy">Đang chiếu: {freeSlots.busy.map((busy) => `${formatTime(busy.startsAt)} – ${formatTime(busy.endsAt)}`).join(", ")}</p>}
        </div>
        {preview && <div className={`bulk-preview ${preview.valid ? "valid" : "invalid"}`}><strong>{preview.valid ? `Có thể tạo ${preview.slots.length} suất chiếu` : "Lịch có xung đột"}</strong><div className="bulk-preview-list">{preview.slots.map((slot) => <span key={slot.index} className={slot.available ? "available" : "conflict"}>Suất {slot.index}: {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}{slotConflictLabel(slot)}</span>)}</div></div>}
        <div className="form-actions"><button className="secondary" type="button" disabled={loading || previewLoading} onClick={onCancel}>Hủy</button><button className="secondary" type="button" disabled={loading || previewLoading} onClick={() => void previewSlots()}>{previewLoading ? "Đang kiểm tra…" : "Xem trước"}</button><button className="primary" disabled={loading || previewLoading || !preview?.valid}>{loading ? "Đang tạo…" : "Tạo toàn bộ suất"}</button></div>
      </form>
    </Modal>
  );
}

export function AdminShowtimesPage() {
  const queryClient = useQueryClient();
  const [movieId, setMovieId] = useState("");
  const [cinemaId, setCinemaId] = useState("");
  const [status, setStatus] = useState<MovieStatus | "">("");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [includePast, setIncludePast] = useState(true);
  const [modal, setModal] = useState<{
    mode: FormMode;
    showtime?: Showtime;
  } | null>(null);
  const [bulkModal, setBulkModal] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const moviesQuery = useQuery({
    queryKey: ["admin-movies", "showtime-options"],
    queryFn: ({ signal }) => api.adminMovies({ pageSize: 100 }, signal),
  });
  const cinemasQuery = useQuery({
    queryKey: ["admin-cinemas"],
    queryFn: ({ signal }) => api.cinemas(undefined, signal),
  });
  const query = useQuery({
    queryKey: ["admin-showtimes", movieId, cinemaId, status, specialOnly, includePast],
    queryFn: ({ signal }) =>
      api.adminShowtimes(
        {
          movieId: movieId || undefined,
          cinemaId: cinemaId || undefined,
           status: status || undefined,
           specialOnly: specialOnly || undefined,
           includePast,
          pageSize: 100,
        },
        signal,
      ),
  });
  const detailQuery = useQuery({
    queryKey: ["admin-showtime", detailId],
    queryFn: ({ signal }) => api.adminShowtime(detailId, signal),
    enabled: Boolean(detailId),
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateShowtimeRequest | UpdateShowtimeRequest }) =>
      id
        ? api.updateShowtime(id, body as UpdateShowtimeRequest)
        : api.createShowtime(body as CreateShowtimeRequest),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] });
      setModal(null);
      setDetailId("");
      setMutationError("");
    },
  });
  const bulkMutation = useMutation({
    mutationFn: (body: BulkShowtimeRequest) => api.createBulkShowtimes(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] });
      setBulkModal(false);
      setMutationError("");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteShowtime(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] });
      setConfirm(null);
    },
  });
  const showtimes = query.data?.data ?? [];
  const movies = moviesQuery.data?.data ?? [];
  const cinemas = cinemasQuery.data ?? [];
  const detail = detailQuery.data ?? modal?.showtime;
  const optionsPending = moviesQuery.isPending || cinemasQuery.isPending;

  async function save(body: CreateShowtimeRequest | UpdateShowtimeRequest) {
    setMutationError("");
    try {
      await saveMutation.mutateAsync({ id: modal?.showtime?.id, body });
    } catch (cause) {
      setMutationError(mutationMessage(cause));
    }
  }

  async function createBulk(body: BulkShowtimeRequest) {
    setMutationError("");
    try {
      await bulkMutation.mutateAsync(body);
    } catch (cause) {
      setMutationError(mutationMessage(cause));
      throw cause;
    }
  }

  function edit(showtime: Showtime) {
    setMutationError("");
    setDetailId(showtime.id);
    setModal({ mode: "edit", showtime });
  }

  function askDelete(showtime: Showtime) {
    setConfirm({
      title: "Xóa suất chiếu?",
      message: `Suất ${formatTime(showtime.startsAt)} của “${showtime.movie.title}” sẽ bị xóa.`,
      onConfirm: () => deleteMutation.mutate(showtime.id),
    });
  }

  return (
    <AdminPage>
      <PageHeader eyebrow="LỊCH VẬN HÀNH" title="Suất chiếu">
        <div className="admin-page-actions">
          <button className="secondary" type="button" disabled={optionsPending} onClick={() => { setMutationError(""); setBulkModal(true); }}>
            + Lập lịch hàng loạt
          </button>
          <button
            className="primary"
            type="button"
            disabled={optionsPending}
            onClick={() => {
            setMutationError("");
            setDetailId("");
            setModal({ mode: "create" });
          }}
         >
           + Thêm suất chiếu
         </button>
        </div>
       </PageHeader>
      <Toolbar>
        <select
          aria-label="Lọc phim"
          value={movieId}
          onChange={(event) => setMovieId(event.target.value)}
        >
          <option value="">Tất cả phim</option>
          {movies.map((movie) => (
            <option key={movie.id} value={movie.id}>
              {movie.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc cụm rạp"
          value={cinemaId}
          onChange={(event) => setCinemaId(event.target.value)}
        >
          <option value="">Tất cả cụm rạp</option>
          {cinemas.map((cinema) => (
            <option key={cinema.id} value={cinema.id}>
              {cinema.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc trạng thái phim"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as MovieStatus | "")
          }
        >
          <option value="">Mọi trạng thái phim</option>
          {movieStatuses.map((value) => (
            <option key={value} value={value}>
              {movieStatusText(value)}
            </option>
          ))}
        </select>
         <label className="admin-checkbox">
           <input type="checkbox" checked={specialOnly} onChange={(event) => setSpecialOnly(event.target.checked)} />
           Suất đặc biệt
         </label>
         <label className="admin-checkbox">
           <input
             type="checkbox"
             checked={includePast}
            onChange={(event) => setIncludePast(event.target.checked)}
          />{" "}
          Bao gồm suất đã bắt đầu
        </label>
      </Toolbar>
      {(moviesQuery.isError || cinemasQuery.isError) && (
        <ErrorState
          cause={moviesQuery.error ?? cinemasQuery.error}
          fallback="Không thể tải bộ lọc lịch chiếu."
          onRetry={() => {
            void moviesQuery.refetch();
            void cinemasQuery.refetch();
          }}
        />
      )}
      {query.isError && (
        <ErrorState
          cause={query.error}
          fallback="Không thể tải lịch chiếu."
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isPending && <LoadingState label="Đang tải lịch chiếu…" />}
      {query.isSuccess && !showtimes.length && (
        <EmptyState>Không có suất chiếu phù hợp với bộ lọc.</EmptyState>
      )}
      {showtimes.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Phim</th>
                <th>Thời gian</th>
                <th>Phòng chiếu</th>
                <th>Giá cơ bản</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {showtimes.map((showtime) => (
                <tr key={showtime.id}>
                  <td>
                    <strong>{showtime.movie.title}</strong>
                    <small>{movieStatusText(showtime.movie.status)}</small>
                  </td>
                  <td>
                    <strong>{formatDate(showtime.startsAt)}</strong>
                    <small>Kết thúc {formatTime(showtime.endsAt)}</small>
                  </td>
                  <td>
                    <strong>{showtime.room.name}</strong>
                     <small>
                       {showtime.room.cinema?.name ??
                         `Mã rạp: ${showtime.room.cinemaId}`} · {roomFormatText[showtime.room.format ?? "STANDARD"]} · {showtimeFormatText[showtime.format ?? "TWO_D_SUBTITLED"]}
                     </small>
                   </td>
                   <td>{money(showtime.basePrice ?? 0)}</td>
                  <td>
                    <div className="admin-actions">
                      <button
                        className="secondary compact-button"
                        type="button"
                        onClick={() => edit(showtime)}
                      >
                        Sửa
                      </button>
                      <button
                        className="danger compact-button"
                        type="button"
                        disabled={deleteMutation.isPending}
                        onClick={() => askDelete(showtime)}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bulkModal && (
        <BulkShowtimeForm
          movies={movies}
          cinemas={cinemas}
          loading={bulkMutation.isPending}
          error={mutationError}
          onCancel={() => setBulkModal(false)}
          onSubmit={createBulk}
        />
      )}
      {modal && modal.mode === "create" && (
        <ShowtimeForm
          mode="create"
          movies={movies}
          cinemas={cinemas}
          loading={saveMutation.isPending}
          error={mutationError}
          onCancel={() => setModal(null)}
          onSubmit={save}
        />
      )}
      {modal && modal.mode === "edit" && detailQuery.isPending && (
        <Modal
          eyebrow="CHI TIẾT SUẤT CHIẾU"
          title="Đang tải suất chiếu"
          onClose={() => {
            setModal(null);
            setDetailId("");
          }}
        >
          <LoadingState label="Đang tải chi tiết suất chiếu…" />
        </Modal>
      )}
      {modal && modal.mode === "edit" && detailQuery.isError && (
        <Modal
          eyebrow="CHI TIẾT SUẤT CHIẾU"
          title="Không thể tải suất chiếu"
          onClose={() => {
            setModal(null);
            setDetailId("");
          }}
        >
          <ErrorState
            cause={detailQuery.error}
            fallback="Không thể tải chi tiết suất chiếu."
            onRetry={() => void detailQuery.refetch()}
          />
        </Modal>
      )}
      {modal && modal.mode === "edit" && detail && (
        <ShowtimeForm
          mode="edit"
          showtime={detail}
          movies={movies}
          cinemas={cinemas}
          loading={saveMutation.isPending}
          error={mutationError}
          onCancel={() => {
            setModal(null);
            setDetailId("");
          }}
          onSubmit={save}
        />
      )}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          loading={deleteMutation.isPending}
          error={
            deleteMutation.error
              ? mutationMessage(deleteMutation.error)
              : undefined
          }
          onClose={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  );
}

export function AdminPaymentsPage() {
  const [filterStatus, setFilterStatus] = useState<string>('');
  const queryClient = useQueryClient();
  const txQuery = useQuery({
    queryKey: ['admin-sepay-transactions', filterStatus],
    queryFn: ({ signal }) => api.adminSepayTransactions(filterStatus || undefined, signal),
    refetchInterval: 10000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: 'CONFIRMED' | 'REVIEW_REQUIRED' | 'REFUNDED'; adminNote?: string }) =>
      api.adminUpdateSepayTransaction(id, { status, adminNote }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-sepay-transactions'] });
    },
  });

  const transactions = txQuery.data ?? [];

  return (
    <AdminPage>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">SEPAY TRANSACTIONS</p>
          <h1>Giao dịch chuyển khoản SePay</h1>
        </div>
      </div>
      <div className="filter-tabs">
        <button className={`tab-button ${!filterStatus ? 'active' : ''}`} onClick={() => setFilterStatus('')}>Tất cả</button>
        <button className={`tab-button ${filterStatus === 'REVIEW_REQUIRED' ? 'active' : ''}`} onClick={() => setFilterStatus('REVIEW_REQUIRED')}>Cần xử lý / Hoàn tiền</button>
        <button className={`tab-button ${filterStatus === 'CONFIRMED' ? 'active' : ''}`} onClick={() => setFilterStatus('CONFIRMED')}>Đã xác nhận</button>
        <button className={`tab-button ${filterStatus === 'REFUNDED' ? 'active' : ''}`} onClick={() => setFilterStatus('REFUNDED')}>Đã hoàn tiền</button>
      </div>
      {txQuery.isPending && <LoadingState label="Đang tải giao dịch…" />}
      {txQuery.isError && <ErrorState cause={txQuery.error} fallback="Không thể tải giao dịch." onRetry={() => void txQuery.refetch()} />}
      {txQuery.isSuccess && !transactions.length && <EmptyState>Không có giao dịch nào.</EmptyState>}
      {txQuery.isSuccess && Boolean(transactions.length) && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID SePay</th>
                <th>Cổng</th>
                <th>Số tiền</th>
                <th>Nội dung CK</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td><strong>#{tx.sepayId}</strong></td>
                  <td>{tx.gateway}</td>
                  <td><strong>{money(tx.transferAmount)}</strong></td>
                  <td><code className="payment-code-pill">{tx.content}</code></td>
                  <td>{formatDate(tx.transactionDate)} {formatTime(tx.transactionDate)}</td>
                  <td><span className={`status ${tx.status.toLowerCase()}`}>{tx.status}</span></td>
                  <td>
                    {tx.status === 'REVIEW_REQUIRED' && (
                      <div className="action-button-group">
                        <button
                          type="button"
                          className="secondary btn-sm"
                          disabled={updateMutation.isPending}
                          onClick={() => {
                            const note = prompt('Ghi chú xử lý (tùy chọn):') ?? undefined;
                            updateMutation.mutate({ id: tx.id, status: 'REFUNDED', adminNote: note });
                          }}
                        >
                          Đánh dấu đã hoàn tiền
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
