import { useMemo, useState } from "react";
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
} from "../components/ui";
import type {
  Cinema,
  CreateCinemaRequest,
  CreateMovieRequest,
  CreateRoomRequest,
  CreateSeatRequest,
  CreateShowtimeRequest,
  Movie,
  MovieStatus,
  RoomResponse,
  Seat,
  SeatType,
  Showtime,
  UpdateCinemaRequest,
  UpdateMovieRequest,
  UpdateShowtimeRequest,
} from "../types";
import { errorMessage, formatDate, formatTime, money } from "../utils/format";

type FormMode = "create" | "edit";

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

const movieStatuses: MovieStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const seatTypes: SeatType[] = ["STANDARD", "VIP", "COUPLE"];
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
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`admin-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
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
  return (
    <div className="modal-backdrop" role="presentation">
      <div
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

  return (
    <AdminPage>
      <div className="admin-breadcrumb">
        <Link to="/admin">CineBook Admin</Link>
        <span>›</span>
        <strong>Tổng quan</strong>
      </div>
      <PageHeader eyebrow="CINEBOOK CONTROL" title="Tổng quan vận hành">
        <Link className="primary" to="/admin/showtimes">
          Quản lý suất chiếu <span>→</span>
        </Link>
      </PageHeader>
      <p className="admin-lead">
        Không gian quản trị nội dung, cụm rạp và lịch chiếu của CineBook.
      </p>
      {isPending && <LoadingState label="Đang tổng hợp dữ liệu…" />}
      {error && !isPending && (
        <ErrorState
          cause={error}
          fallback="Không thể tải tổng quan."
          onRetry={() => {
            void moviesQuery.refetch();
            void cinemasQuery.refetch();
            void showtimesQuery.refetch();
          }}
        />
      )}
      {!isPending && !error && (
        <>
          <div className="admin-stat-grid">
            <Link className="admin-stat-card" to="/admin/movies">
              <span className="admin-stat-label">Phim trong hệ thống</span>
              <strong>{moviesQuery.data?.meta.total ?? 0}</strong>
              <span>Quản lý nội dung →</span>
            </Link>
            <Link className="admin-stat-card" to="/admin/cinemas">
              <span className="admin-stat-label">Cụm rạp</span>
              <strong>{cinemasQuery.data?.length ?? 0}</strong>
              <span>Quản lý phòng chiếu →</span>
            </Link>
            <Link className="admin-stat-card" to="/admin/showtimes">
              <span className="admin-stat-label">Suất chiếu</span>
              <strong>{showtimesQuery.data?.meta.total ?? 0}</strong>
              <span>Xem lịch vận hành →</span>
            </Link>
          </div>
          <div className="admin-dashboard-grid">
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <p className="eyebrow">LỊCH VẬN HÀNH</p>
                  <h2>Suất chiếu gần đây</h2>
                </div>
                <Link to="/admin/showtimes">Xem tất cả →</Link>
              </div>
              {showtimes.length === 0 ? (
                <EmptyState>Chưa có suất chiếu để hiển thị.</EmptyState>
              ) : (
                <div className="admin-recent-list">
                  {showtimes.slice(0, 5).map((showtime) => (
                    <Link
                      className="admin-recent-row"
                      key={showtime.id}
                      to="/admin/showtimes"
                    >
                      <span className="admin-recent-time">
                        {formatTime(showtime.startsAt)}
                      </span>
                      <span>
                        <strong>{showtime.movie.title}</strong>
                        <small>
                          {showtime.room.cinema?.name ?? "Cụm rạp"} ·{" "}
                          {showtime.room.name}
                        </small>
                      </span>
                      <span className="admin-recent-date">
                        {formatDate(showtime.startsAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section className="admin-panel admin-quick-panel">
              <div className="admin-panel-heading">
                <div>
                  <p className="eyebrow">TÁC VỤ NHANH</p>
                  <h2>Quản lý hệ thống</h2>
                </div>
                <span>Điều hướng</span>
              </div>
              <div className="admin-quick-links">
                <Link to="/admin/movies">
                  <span>▣</span>
                  <strong>Quản lý phim</strong>
                  <small>Cập nhật nội dung và trạng thái phát hành</small>
                </Link>
                <Link to="/admin/cinemas">
                  <span>▤</span>
                  <strong>Quản lý rạp & phòng</strong>
                  <small>Kiểm tra phòng chiếu và sơ đồ ghế</small>
                </Link>
                <Link to="/admin/showtimes">
                  <span>◷</span>
                  <strong>Quản lý suất chiếu</strong>
                  <small>Tạo và cập nhật lịch vận hành</small>
                </Link>
              </div>
            </section>
          </div>
        </>
      )}
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

function TmdbMovieModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [search, setSearch] = useState("");
  const [importError, setImportError] = useState("");
  const query = useQuery({
    queryKey: ["tmdb-movies", search],
    queryFn: ({ signal }) =>
      api.tmdbMovies({ search: search || undefined }, signal),
  });
  const importMutation = useMutation({
    mutationFn: (tmdbId: number) => api.importTmdbMovie(tmdbId),
    onSuccess: () => onImported(),
    onError: (cause) => setImportError(mutationMessage(cause)),
  });
  const movies = query.data?.data ?? [];

  return (
    <Modal eyebrow="THƯ VIỆN TMDB" title="Nhập phim từ TMDB" onClose={onClose} className="tmdb-admin-modal">
      <div className="tmdb-modal">
        <p className="admin-copy">
          Tìm phim đang chiếu hoặc theo tên, sau đó nhập vào hệ thống dưới trạng
          thái bản nháp để kiểm tra trước khi phát hành.
        </p>
        <div className="tmdb-search">
          <input
            aria-label="Tìm phim TMDB"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm tên phim…"
          />
          <button
            className="secondary compact-button"
            type="button"
            onClick={() => void query.refetch()}
          >
            Tìm kiếm
          </button>
        </div>
        {query.isPending && <LoadingState label="Đang tải danh sách TMDB…" />}
        {query.isError && (
          <ErrorState
            cause={query.error}
            fallback="Không thể tải danh sách TMDB."
            onRetry={() => void query.refetch()}
          />
        )}
        {importError && (
          <p className="form-error" role="alert">
            {importError}
          </p>
        )}
        {query.isSuccess && !movies.length && (
          <EmptyState>Không tìm thấy phim trên TMDB.</EmptyState>
        )}
        {movies.length > 0 && (
          <div className="tmdb-results">
            {movies.map((movie) => (
              <article className="tmdb-result" key={movie.tmdbId}>
                <div
                  className="tmdb-poster"
                  style={
                    movie.posterUrl
                      ? { backgroundImage: `url("${movie.posterUrl}")` }
                      : undefined
                  }
                >
                  {movie.posterUrl ? null : movie.title.slice(0, 1)}
                </div>
                <div className="tmdb-result-copy">
                  <strong>{movie.title}</strong>
                  <small>
                    {movie.releaseDate || "Chưa có ngày phát hành"} · Điểm{" "}
                    {movie.rating?.toFixed(1) ?? "—"}
                  </small>
                  <p>{movie.description || "Chưa có mô tả."}</p>
                </div>
                <button
                  className={
                    movie.imported
                      ? "secondary compact-button"
                      : "primary compact-button"
                  }
                  type="button"
                  disabled={movie.imported || importMutation.isPending}
                  onClick={() => importMutation.mutate(movie.tmdbId)}
                >
                  {movie.imported
                    ? "Đã nhập"
                    : importMutation.isPending
                      ? "Đang nhập…"
                      : "Nhập phim"}
                </button>
              </article>
            ))}
          </div>
        )}
        <small className="tmdb-attribution">
          Dữ liệu và hình ảnh phim cung cấp bởi TMDB. CineBook không được TMDB
          chứng nhận hoặc xác thực.
        </small>
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
  const movies = query.data?.data ?? [];

  async function save(body: CreateMovieRequest) {
    setMutationError("");
    try {
      await saveMutation.mutateAsync({ id: modal?.movie?.id, body });
    } catch (cause) {
      setMutationError(mutationMessage(cause));
    }
  }

  function handleTmdbImported() {
    setTmdbOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["admin-movies"] });
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
      {tmdbOpen && (
        <TmdbMovieModal
          onClose={() => setTmdbOpen(false)}
          onImported={handleTmdbImported}
        />
      )}
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
  const query = useQuery({
    queryKey: ["admin-cinemas"],
    queryFn: ({ signal }) => api.cinemas(undefined, signal),
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
      {cinemas.length > 0 && (
        <div className="admin-card-grid">
          {cinemas.map((cinema, index) => (
            <article className="admin-entity-card" key={cinema.id}>
              <div className={`admin-card-mark admin-card-mark-${index % 3}`}>
                {cinema.name.slice(0, 1)}
              </div>
              <div className="admin-entity-content">
                <div className="admin-card-heading">
                  <div>
                    <p className="eyebrow">
                      CỤM RẠP {String(index + 1).padStart(2, "0")}
                    </p>
                    <h2>{cinema.name}</h2>
                  </div>
                  <span className="admin-count">
                    {cinema.roomCount ?? 0} phòng
                  </span>
                </div>
                <p className="admin-address">
                  ⌖ {cinema.address}
                  <small>
                    {cinema.province?.name ?? `Mã tỉnh: ${cinema.provinceCode}`}
                  </small>
                </p>
                <div className="admin-card-footer">
                  <Link
                    className="primary"
                    to={`/admin/cinemas/${cinema.id}/rooms`}
                  >
                    Quản lý phòng
                  </Link>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      setMutationError("");
                      setModal({ mode: "edit", cinema });
                    }}
                  >
                    Sửa
                  </button>
                  <button
                    className="danger"
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => askDelete(cinema)}
                  >
                    Xóa
                  </button>
                </div>
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ name, cinemaId });
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
      id ? api.updateRoom(id, { name: body.name }) : api.createRoom(body),
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
                <span>
                  {room.seatCount ?? room.seats?.length ?? 0} ghế · Cập nhật{" "}
                  {formatDate(room.updatedAt)}
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
  const [type, setType] = useState<SeatType>(seat?.type ?? "STANDARD");

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
              {seatTypes.map((value) => (
                <option key={value} value={value}>
                  {seatTypeText(value)}
                </option>
              ))}
            </select>
          </Field>
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
  const [columns, setColumns] = useState(8);
  const [layoutType, setLayoutType] = useState<SeatType>("STANDARD");
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
    const layout: CreateSeatRequest[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let number = 1; number <= columns; number += 1) {
        layout.push({
          row: String.fromCharCode(65 + row),
          number,
          type: layoutType,
        });
      }
    }
    return layout;
  }

  function askLayout() {
    setConfirm({
      title: "Thay thế toàn bộ sơ đồ?",
      message: `Sơ đồ mới gồm ${rows} hàng × ${columns} ghế và sẽ thay thế sơ đồ hiện tại.`,
      onConfirm: () => layoutMutation.mutate(makeLayout()),
    });
  }

  function askDelete(seat: Seat) {
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
          <NumberField label="Số hàng" min={1} max={26} value={rows} onChange={setRows} />
          <NumberField label="Ghế mỗi hàng" min={1} max={100} value={columns} onChange={setColumns} />
            <Field label="Loại ghế">
              <select
                value={layoutType}
                onChange={(event) =>
                  setLayoutType(event.target.value as SeatType)
                }
              >
                {seatTypes.map((value) => (
                  <option key={value} value={value}>
                    {seatTypeText(value)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className="secondary"
            type="button"
            disabled={layoutMutation.isPending || rows < 1 || columns < 1}
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
                <button className="secondary compact-button" type="button" onClick={() => { setMutationError(""); setEditing(seat); }}>Sửa</button>
                <button className="danger compact-button" type="button" disabled={deleteMutation.isPending} onClick={() => askDelete(seat)}>Xóa</button>
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
  onSubmit: (body: CreateShowtimeRequest) => Promise<void>;
};

function localDateTime(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
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
  const [endsAt, setEndsAt] = useState(localDateTime(showtime?.endsAt));
  const [basePrice, setBasePrice] = useState(
    Number(showtime?.basePrice ?? 100000),
  );
  const [vipMultiplier, setVipMultiplier] = useState(
    showtime?.vipMultiplier ? Number(showtime.vipMultiplier) : 1.5,
  );
  const [coupleMultiplier, setCoupleMultiplier] = useState(
    showtime?.coupleMultiplier ? Number(showtime.coupleMultiplier) : 2.2,
  );
  const roomsQuery = useQuery({
    queryKey: ["admin-showtime-rooms", cinemaId],
    queryFn: ({ signal }) => api.rooms(cinemaId, signal),
    enabled: Boolean(cinemaId),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      movieId,
      roomId,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      basePrice,
      vipMultiplier: vipMultiplier || undefined,
      coupleMultiplier: coupleMultiplier || undefined,
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
                .filter((movie) => movie.status !== "ARCHIVED")
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
                  {room.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bắt đầu">
            <input
              required
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Kết thúc">
            <input
              required
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
          <NumberField label="Giá cơ bản" min={0} step={1000} value={basePrice} onChange={setBasePrice} />
          <NumberField label="Hệ số VIP" min={0} step={0.01} value={vipMultiplier} onChange={setVipMultiplier} />
          <NumberField label="Hệ số ghế đôi" min={0} step={0.01} value={coupleMultiplier} onChange={setCoupleMultiplier} />
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

export function AdminShowtimesPage() {
  const queryClient = useQueryClient();
  const [movieId, setMovieId] = useState("");
  const [cinemaId, setCinemaId] = useState("");
  const [status, setStatus] = useState<MovieStatus | "">("");
  const [includePast, setIncludePast] = useState(true);
  const [modal, setModal] = useState<{
    mode: FormMode;
    showtime?: Showtime;
  } | null>(null);
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
    queryKey: ["admin-showtimes", movieId, cinemaId, status, includePast],
    queryFn: ({ signal }) =>
      api.adminShowtimes(
        {
          movieId: movieId || undefined,
          cinemaId: cinemaId || undefined,
          status: status || undefined,
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
    mutationFn: ({ id, body }: { id?: string; body: CreateShowtimeRequest }) =>
      id
        ? api.updateShowtime(id, body as UpdateShowtimeRequest)
        : api.createShowtime(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] });
      setModal(null);
      setDetailId("");
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

  async function save(body: CreateShowtimeRequest) {
    setMutationError("");
    try {
      await saveMutation.mutateAsync({ id: modal?.showtime?.id, body });
    } catch (cause) {
      setMutationError(mutationMessage(cause));
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
                        `Mã rạp: ${showtime.room.cinemaId}`}
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
