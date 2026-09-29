import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "../../../components/ui";
import type {
  CreateMovieRequest,
  Movie,
  MovieStatus,
  TmdbMovieResponse,
  UpdateMovieRequest,
} from "../../../types";
import { formatDate } from "../../../utils/format";
import { patchTmdbMovieCaches, runTmdbImportQueue, TMDB_IMPORT_LIMIT } from "../../../utils/tmdb-import";
import {
  AdminPage,
  CharacterTextarea,
  ConfirmDialog,
  Field,
  FormActions,
  Modal,
  movieStatuses,
  movieStatusText,
  mutationMessage,
  NumberField,
  Toolbar,
  youtubeKey,
  type ConfirmState,
  type FormMode,
} from "../shared";

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
            <input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </Field>
          <NumberField label="Thời lượng (phút)" min={1} max={600} value={form.duration} onChange={(duration) => setForm({ ...form, duration })} />
          <Field label="Trạng thái">
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as MovieStatus })}>
              {movieStatuses.map((status) => <option key={status} value={status}>{movieStatusText(status)}</option>)}
            </select>
          </Field>
          <Field label="Poster URL" wide><input type="url" value={form.posterUrl ?? ""} onChange={(event) => setForm({ ...form, posterUrl: event.target.value })} placeholder="https://…" /></Field>
          <Field label="Backdrop URL" wide><input type="url" value={form.backdropUrl ?? ""} onChange={(event) => setForm({ ...form, backdropUrl: event.target.value })} placeholder="https://…" /></Field>
          <Field label="Ngày khởi chiếu"><input type="date" value={form.releaseDate ?? ""} onChange={(event) => setForm({ ...form, releaseDate: event.target.value || null })} /></Field>
          <NumberField label="Điểm TMDB" min={0} max={10} step={0.1} value={Number(form.rating ?? 0)} onChange={(rating) => setForm({ ...form, rating })} />
          <Field label="Phân loại độ tuổi"><input maxLength={20} value={form.ageRating ?? ""} onChange={(event) => setForm({ ...form, ageRating: event.target.value || null })} placeholder="Ví dụ: T13" /></Field>
          <Field label="Thể loại" wide><input value={(form.genres ?? []).join(", ")} onChange={(event) => setForm({ ...form, genres: event.target.value.split(",").map((genre) => genre.trim()).filter(Boolean) })} placeholder="Ví dụ: Hành động, Khoa học viễn tưởng" /></Field>
          <Field label="Trailer YouTube" wide><input value={form.trailerKey ?? ""} onChange={(event) => setForm({ ...form, trailerKey: event.target.value })} placeholder="Mã video hoặc URL YouTube" /></Field>
          <CharacterTextarea label="Mô tả phim" maxLength={5000} value={form.description ?? ""} onChange={(description) => setForm({ ...form, description })} rows={5} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <FormActions loading={loading} onCancel={onCancel} submitLabel={mode === "create" ? "Tạo phim" : "Lưu thay đổi"} />
      </form>
    </Modal>
  );
}

export function AdminMoviesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MovieStatus | "">("");
  const [modal, setModal] = useState<{ mode: FormMode; movie?: Movie } | null>(null);
  const [tmdbOpen, setTmdbOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const query = useQuery({
    queryKey: ["admin-movies", search, status],
    queryFn: ({ signal }) => api.adminMovies({ search: search || undefined, status: status || undefined, pageSize: 100 }, signal),
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateMovieRequest }) => id ? api.updateMovie(id, body as UpdateMovieRequest) : api.createMovie(body),
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
          <button className="secondary" type="button" onClick={() => setTmdbOpen(true)}>Nhập từ TMDB</button>
          <button className="primary" type="button" onClick={() => { setMutationError(""); setModal({ mode: "create" }); }}>+ Thêm phim</button>
        </div>
      </PageHeader>
      <Toolbar>
        <input aria-label="Tìm phim" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên phim…" />
        <select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value as MovieStatus | "")}>
          <option value="">Tất cả trạng thái</option>
          {movieStatuses.map((value) => <option key={value} value={value}>{movieStatusText(value)}</option>)}
        </select>
      </Toolbar>
      {mutationError && !modal && <p className="form-error">{mutationError}</p>}
      {query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách phim." onRetry={() => void query.refetch()} />}
      {query.isPending && <LoadingState label="Đang tải danh sách phim…" />}
      {query.isSuccess && !movies.length && <EmptyState>{search ? "Không tìm thấy phim phù hợp." : "Chưa có phim để quản lý."}</EmptyState>}
      {movies.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Phim</th><th>Thời lượng</th><th>Trạng thái</th><th>Cập nhật</th><th /></tr></thead>
            <tbody>
              {movies.map((movie) => <tr key={movie.id}>
                <td><strong>{movie.title}</strong><small>{movie.description || "Chưa có mô tả"}</small></td>
                <td>{movie.duration} phút</td>
                <td><StatusBadge status={movie.status} /></td>
                <td>{formatDate(movie.updatedAt)}</td>
                <td><div className="admin-actions">
                  {movie.status !== "PUBLISHED" && movie.status !== "ARCHIVED" && <button className="primary compact-button" type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(movie)}>Đưa vào đang chiếu</button>}
                  <button className="secondary compact-button" type="button" onClick={() => { setMutationError(""); setModal({ mode: "edit", movie }); }}>Sửa</button>
                  <button className="danger compact-button" type="button" disabled={movie.status === "ARCHIVED" || archiveMutation.isPending} onClick={() => askArchive(movie)}>Lưu trữ</button>
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      {tmdbOpen && <TmdbMovieModal onClose={() => setTmdbOpen(false)} />}
      {modal && <MovieForm mode={modal.mode} movie={modal.movie} loading={saveMutation.isPending} error={mutationError} onCancel={() => setModal(null)} onSubmit={save} />}
      {confirm && <ConfirmDialog state={confirm} loading={archiveMutation.isPending} error={archiveMutation.error ? mutationMessage(archiveMutation.error) : undefined} onClose={() => setConfirm(null)} />}
    </AdminPage>
  );
}
