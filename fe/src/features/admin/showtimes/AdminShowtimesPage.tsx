import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api";
import { Alert, EmptyState, ErrorState, LoadingState, PageHeader } from "../../../components/ui";
import type {
  BulkShowtimePreviewResponse,
  BulkShowtimeRequest,
  Cinema,
  CinemaBulkPreviewResponse,
  CinemaBulkShowtimeRequest,
  CinemaFreeSlotsResponse,
  CreateShowtimeRequest,
  FreeSlotsResponse,
  Movie,
  MovieStatus,
  Showtime,
  UpdateShowtimeRequest,
} from "../../../types";
import { errorMessage, formatDate, formatTime, money } from "../../../utils/format";
import {
  AdminPage,
  ConfirmDialog,
  Field,
  FormActions,
  Modal,
  movieStatuses,
  movieStatusText,
  mutationMessage,
  NumberField,
  roomFormatText,
  showtimeFormats,
  showtimeFormatText,
  Toolbar,
  type ConfirmState,
  type FormMode,
} from "../shared";

function localDateTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)).replace(" ", "T");
}

export function vietnameseDateTime(value: string) {
  return `${value}:00+07:00`;
}

function isWithinVenueHours(localValue: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "numeric", hourCycle: "h23" }).format(new Date(vietnameseDateTime(localValue))));
  return hour >= 8 && hour <= 23;
}

function slotConflictLabel(slot: BulkShowtimePreviewResponse["slots"][number]) {
  if (slot.available) return "";
  if (slot.reasonCode === "SHOWTIME_OUTSIDE_HOURS") return " · Ngoài giờ vận hành (08:00–23:00)";
  const slotDay = vnDay(slot.startsAt);
  const ranges = (slot.conflicts ?? []).map((conflict) => {
    const range = `${formatTime(conflict.startsAt)} – ${formatTime(conflict.endsAt)}`;
    return vnDay(conflict.startsAt) === slotDay ? range : `${formatDate(conflict.startsAt)} ${range}`;
  });
  return ranges.length ? ` · Trùng với suất ${ranges.join(", ")}` : " · Trùng lịch chiếu";
}

function vnDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
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

function ShowtimeForm({ mode, showtime, movies, cinemas, loading, error, onCancel, onSubmit }: ShowtimeFormProps) {
  const [movieId, setMovieId] = useState(showtime?.movieId ?? "");
  const [cinemaId, setCinemaId] = useState(showtime?.room.cinemaId ?? "");
  const [roomId, setRoomId] = useState(showtime?.roomId ?? "");
  const [startsAt, setStartsAt] = useState(localDateTime(showtime?.startsAt));
  const [format, setFormat] = useState(showtime?.format ?? "TWO_D_SUBTITLED");
  const selectedMovie = movies.find((movie) => movie.id === movieId);
  const calculatedEndsAt = startsAt && selectedMovie ? new Date(new Date(vietnameseDateTime(startsAt)).getTime() + selectedMovie.duration * 60 * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" }) : "Chọn phim và giờ bắt đầu";
  const initialPricing = { basePrice: showtime?.basePrice != null ? Number(showtime.basePrice) : 110000, vipMultiplier: showtime?.vipMultiplier != null ? Number(showtime.vipMultiplier) : 1.1, coupleMultiplier: showtime?.coupleMultiplier != null ? Number(showtime.coupleMultiplier) : 1.2 };
  const [basePrice, setBasePrice] = useState(initialPricing.basePrice);
  const [vipMultiplier, setVipMultiplier] = useState(initialPricing.vipMultiplier);
  const [coupleMultiplier, setCoupleMultiplier] = useState(initialPricing.coupleMultiplier);
  const [pricingOverridesEnabled, setPricingOverridesEnabled] = useState(mode === "edit" && Boolean(showtime));
  const roomsQuery = useQuery({ queryKey: ["admin-showtime-rooms", cinemaId], queryFn: ({ signal }) => api.rooms(cinemaId, signal), enabled: Boolean(cinemaId) });
  const selectedRoom = roomsQuery.data?.find((room) => room.id === roomId);
  const pricingQuote = useQuery({
    queryKey: ["admin-showtime-pricing", selectedRoom?.format, format, startsAt, pricingOverridesEnabled, basePrice, vipMultiplier, coupleMultiplier],
    queryFn: () => api.quoteShowtimePricing({ roomFormat: selectedRoom!.format, showtimeFormat: format, startsAt: vietnameseDateTime(startsAt), ...(pricingOverridesEnabled && { basePrice, vipMultiplier, coupleMultiplier }) }),
    enabled: Boolean(selectedRoom?.format && startsAt.length >= 16),
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ movieId, roomId, startsAt: vietnameseDateTime(startsAt), format, ...(pricingOverridesEnabled && { basePrice, vipMultiplier, coupleMultiplier }) });
  }
  return <Modal eyebrow={mode === "create" ? "LỊCH CHIẾU MỚI" : "CHỈNH SỬA LỊCH CHIẾU"} title={mode === "create" ? "Thêm suất chiếu" : "Cập nhật suất chiếu"} onClose={onCancel}>
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <div className="admin-form-grid">
        <Field label="Phim" wide><select required value={movieId} onChange={(event) => setMovieId(event.target.value)}><option value="">Chọn phim</option>{movies.filter((movie) => movie.status === "PUBLISHED").map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select></Field>
        <Field label="Cụm rạp" wide><select required value={cinemaId} onChange={(event) => { setCinemaId(event.target.value); setRoomId(""); }}><option value="">Chọn cụm rạp</option>{cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select></Field>
        <Field label="Phòng chiếu" wide><select required disabled={!cinemaId || roomsQuery.isPending} value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">{roomsQuery.isPending ? "Đang tải phòng…" : "Chọn phòng"}</option>{(roomsQuery.data ?? []).map((room) => <option key={room.id} value={room.id}>{room.name} · {roomFormatText[room.format]}</option>)}</select></Field>
        <Field label="Định dạng suất chiếu"><select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>{showtimeFormats.map((value) => <option key={value} value={value}>{showtimeFormatText[value]}</option>)}</select></Field>
        <Field label="Bắt đầu"><input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />{startsAt && !isWithinVenueHours(startsAt) && <small className="form-hint-warning">Suất chiếu chỉ được bắt đầu từ 08:00 đến 23:00 hằng ngày (giờ Việt Nam).</small>}</Field>
        <Field label="Kết thúc (tự tính theo thời lượng phim)"><input type="text" value={calculatedEndsAt} readOnly /></Field>
        <label className="admin-field admin-field-wide admin-checkbox-field"><span>Giá vé</span><span className="admin-checkbox-control"><input type="checkbox" checked={pricingOverridesEnabled} onChange={(event) => setPricingOverridesEnabled(event.target.checked)} /> Ghi đè giá theo chính sách</span></label>
        {pricingOverridesEnabled && <><NumberField label="Giá cơ bản override" min={0} step={1000} value={basePrice} onChange={setBasePrice} /><NumberField label="Hệ số VIP override" min={0} step={0.01} value={vipMultiplier} onChange={setVipMultiplier} /><NumberField label="Hệ số ghế đôi override" min={0} step={0.01} value={coupleMultiplier} onChange={setCoupleMultiplier} /></>}
      </div>
      {pricingQuote.isPending && <p className="form-hint">Đang tính giá theo chính sách…</p>}
      {pricingQuote.data && <p className="form-hint">Giá áp dụng ({pricingQuote.data.pricingDayType === "WEEKEND" ? "cuối tuần" : "ngày thường"}): Tiêu chuẩn {money(pricingQuote.data.prices.standard)} · VIP {money(pricingQuote.data.prices.vip)} · Ghế đôi {money(pricingQuote.data.prices.couple)}. {pricingOverridesEnabled ? "Đang dùng giá override." : "Đang dùng policy theo phòng và định dạng."}</p>}
      {pricingQuote.isError && <p className="form-error">Không thể lấy báo giá chính sách.</p>}
      {roomsQuery.isError && <p className="form-error">Không thể tải phòng chiếu của cụm rạp.</p>}
      {error && <p className="form-error">{error}</p>}
      <FormActions loading={loading} onCancel={onCancel} submitLabel={mode === "create" ? "Tạo suất chiếu" : "Lưu thay đổi"} />
    </form>
  </Modal>;
}

type BulkShowtimeFormProps = { movies: Movie[]; cinemas: Cinema[]; loading: boolean; error?: string; onCancel: () => void; onSubmit: (body: BulkShowtimeRequest) => Promise<void> };

function BulkShowtimeForm({ movies, cinemas, loading, error, onCancel, onSubmit }: BulkShowtimeFormProps) {
  const [movieId, setMovieId] = useState("");
  const [cinemaId, setCinemaId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [format, setFormat] = useState<(typeof showtimeFormats)[number]>("TWO_D_SUBTITLED");
  const [firstStartsAt, setFirstStartsAt] = useState("");
  const [count, setCount] = useState(5);
  const [turnaroundMinutes, setTurnaroundMinutes] = useState(20);
  const [basePrice, setBasePrice] = useState(110000);
  const [vipMultiplier, setVipMultiplier] = useState(1.1);
  const [coupleMultiplier, setCoupleMultiplier] = useState(1.2);
  const [pricingOverridesEnabled, setPricingOverridesEnabled] = useState(false);
  const [preview, setPreview] = useState<BulkShowtimePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [freeDate, setFreeDate] = useState(() => localDateTime(new Date().toISOString()).slice(0, 10));
  const [freeSlots, setFreeSlots] = useState<FreeSlotsResponse | null>(null);
  const [freeLoading, setFreeLoading] = useState(false);
  const [freeError, setFreeError] = useState("");
  const selectedBulkMovie = movies.find((movie) => movie.id === movieId);
  const roomsQuery = useQuery({ queryKey: ["admin-bulk-showtime-rooms", cinemaId], queryFn: ({ signal }) => api.rooms(cinemaId, signal), enabled: Boolean(cinemaId) });
  const selectedBulkRoom = roomsQuery.data?.find((room) => room.id === roomId);
  const pricingQuote = useQuery({ queryKey: ["admin-bulk-pricing", selectedBulkRoom?.format, format, firstStartsAt, pricingOverridesEnabled, basePrice, vipMultiplier, coupleMultiplier], queryFn: () => api.quoteShowtimePricing({ roomFormat: selectedBulkRoom!.format, showtimeFormat: format, startsAt: vietnameseDateTime(firstStartsAt), ...(pricingOverridesEnabled && { basePrice, vipMultiplier, coupleMultiplier }) }), enabled: Boolean(selectedBulkRoom?.format && firstStartsAt.length >= 16) });
  const body: BulkShowtimeRequest = { movieId, roomId, firstStartsAt: firstStartsAt ? vietnameseDateTime(firstStartsAt) : "", format, count, turnaroundMinutes, ...(pricingOverridesEnabled && { basePrice, vipMultiplier, coupleMultiplier }) };
  async function previewSlots() { setPreviewError(""); setPreview(null); setPreviewLoading(true); try { setPreview(await api.previewBulkShowtimes(body)); } catch (cause) { setPreviewError(mutationMessage(cause)); } finally { setPreviewLoading(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); if (!preview?.valid) { await previewSlots(); return; } await onSubmit(body); }
  async function loadFreeSlots() { if (!roomId || !selectedBulkMovie) return; setFreeError(""); setFreeSlots(null); setFreeLoading(true); try { setFreeSlots(await api.roomFreeSlots(roomId, { date: freeDate, durationMinutes: selectedBulkMovie.duration, turnaroundMinutes })); } catch (cause) { setFreeError(errorMessage(cause, "Không thể tải khung giờ trống.")); } finally { setFreeLoading(false); } }
  return <Modal eyebrow="LẬP LỊCH HÀNG LOẠT" title="Tạo nhiều suất chiếu" onClose={onCancel} className="bulk-showtime-modal"><form className="admin-form" onSubmit={(event) => void submit(event)}><div className="admin-form-grid"><Field label="Phim" wide><select required value={movieId} onChange={(event) => { setMovieId(event.target.value); setPreview(null); }}><option value="">Chọn phim đã phát hành</option>{movies.filter((movie) => movie.status === "PUBLISHED").map((movie) => <option key={movie.id} value={movie.id}>{movie.title} · {movie.duration} phút</option>)}</select></Field><Field label="Cụm rạp" wide><select required value={cinemaId} onChange={(event) => { setCinemaId(event.target.value); setRoomId(""); setPreview(null); }}><option value="">Chọn cụm rạp</option>{cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select></Field><Field label="Phòng chiếu" wide><select required disabled={!cinemaId || roomsQuery.isPending} value={roomId} onChange={(event) => { setRoomId(event.target.value); setPreview(null); setFreeSlots(null); }}><option value="">{roomsQuery.isPending ? "Đang tải phòng…" : "Chọn phòng"}</option>{(roomsQuery.data ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field><Field label="Định dạng suất chiếu"><select value={format} onChange={(event) => { setFormat(event.target.value as typeof format); setPreview(null); }}>{showtimeFormats.map((value) => <option key={value} value={value}>{showtimeFormatText[value]}</option>)}</select></Field><label className="admin-field admin-field-wide admin-checkbox-field"><span>Giá vé</span><span className="admin-checkbox-control"><input type="checkbox" checked={pricingOverridesEnabled} onChange={(event) => setPricingOverridesEnabled(event.target.checked)} /> Ghi đè giá theo chính sách</span></label><Field label="Suất đầu tiên (giờ Việt Nam)"><input required type="datetime-local" value={firstStartsAt} onChange={(event) => { setFirstStartsAt(event.target.value); setPreview(null); }} /></Field><NumberField label="Số suất" min={1} max={100} value={count} onChange={(value) => { setCount(value); setPreview(null); }} /><NumberField label="Thời gian nghỉ (phút)" min={0} max={180} value={turnaroundMinutes} onChange={(value) => { setTurnaroundMinutes(value); setPreview(null); }} />{pricingOverridesEnabled && <><NumberField label="Giá cơ bản override" min={0} step={1000} value={basePrice} onChange={setBasePrice} /><NumberField label="Hệ số VIP override" min={0} step={0.01} value={vipMultiplier} onChange={setVipMultiplier} /><NumberField label="Hệ số ghế đôi override" min={0} step={0.01} value={coupleMultiplier} onChange={setCoupleMultiplier} /></>}</div>{pricingQuote.isPending && <p className="form-hint">Đang tính giá theo chính sách…</p>}{pricingQuote.data && <p className="form-hint">Giá áp dụng ({pricingQuote.data.pricingDayType === "WEEKEND" ? "cuối tuần" : "ngày thường"}): Tiêu chuẩn {money(pricingQuote.data.prices.standard)} · VIP {money(pricingQuote.data.prices.vip)} · Ghế đôi {money(pricingQuote.data.prices.couple)}. {pricingOverridesEnabled ? "Đang dùng giá override." : "Đang dùng policy theo phòng và định dạng."}</p>}{(roomsQuery.isError || previewError || error || pricingQuote.isError) && <p className="form-error">{previewError || error || (pricingQuote.isError ? "Không thể lấy báo giá chính sách." : "Không thể tải phòng chiếu.")}</p>}<div className="free-slots-box"><div className="free-slots-head"><strong>Khung giờ trống của phòng</strong><span>Rạp mở cửa 08:00 – 23:00 hằng ngày · Bấm vào khung giờ để dùng làm suất đầu tiên</span></div><div className="free-slots-controls"><input type="date" aria-label="Ngày xem khung trống" value={freeDate} onChange={(event) => { setFreeDate(event.target.value); setFreeSlots(null); }} /><button className="secondary" type="button" disabled={!roomId || !selectedBulkMovie || freeLoading} onClick={() => void loadFreeSlots()}>{freeLoading ? "Đang tìm…" : "Xem khung giờ trống"}</button></div>{freeError && <p className="form-error">{freeError}</p>}{freeSlots && (freeSlots.freeWindows.length ? <div className="free-slots-list">{freeSlots.freeWindows.map((window) => <button key={window.startsAt} type="button" className="free-slot-chip" onClick={() => { setFirstStartsAt(localDateTime(window.startsAt)); setPreview(null); }}>{formatTime(window.startsAt)} – {formatTime(window.endsAt)} · trống {window.minutes} phút</button>)}</div> : <p className="free-slots-empty">Phòng kín lịch trong ngày đã chọn.</p>)}{freeSlots && freeSlots.busy.length > 0 && <p className="free-slots-busy">Đang chiếu: {freeSlots.busy.map((busy) => `${formatTime(busy.startsAt)} – ${formatTime(busy.endsAt)}`).join(", ")}</p>}</div>{preview && <div className={`bulk-preview ${preview.valid ? "valid" : "invalid"}`}><strong>{preview.valid ? `Có thể tạo ${preview.slots.length} suất chiếu` : "Lịch có xung đột"}</strong><div className="bulk-preview-list">{preview.slots.map((slot) => <span key={slot.index} className={slot.available ? "available" : "conflict"}>Suất {slot.index}: {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}{slotConflictLabel(slot)}</span>)}</div></div>}<div className="form-actions"><button className="secondary" type="button" disabled={loading || previewLoading} onClick={onCancel}>Hủy</button><button className="secondary" type="button" disabled={loading || previewLoading} onClick={() => void previewSlots()}>{previewLoading ? "Đang kiểm tra…" : "Xem trước"}</button><button className="primary" disabled={loading || previewLoading || !preview?.valid}>{loading ? "Đang tạo…" : "Tạo toàn bộ suất"}</button></div></form></Modal>;
}

function CinemaBulkShowtimeForm({ movies, cinemas, loading, error, onCancel, onSubmit }: { movies: Movie[]; cinemas: Cinema[]; loading: boolean; error?: string; onCancel: () => void; onSubmit: (body: CinemaBulkShowtimeRequest) => Promise<void> }) {
  const [movieId, setMovieId] = useState("");
  const [cinemaId, setCinemaId] = useState("");
  const [date, setDate] = useState(() => localDateTime(new Date(Date.now() + 86400000).toISOString()).slice(0, 10));
  const [count, setCount] = useState(5);
  const [format, setFormat] = useState<(typeof showtimeFormats)[number]>("TWO_D_SUBTITLED");
  const [turnaroundMinutes, setTurnaroundMinutes] = useState(20);
  const [pricingOverridesEnabled, setPricingOverridesEnabled] = useState(false);
  const [basePrice, setBasePrice] = useState(110000);
  const [vipMultiplier, setVipMultiplier] = useState(1.1);
  const [coupleMultiplier, setCoupleMultiplier] = useState(1.2);
  const [preview, setPreview] = useState<CinemaBulkPreviewResponse | null>(null);
  const [freeSlots, setFreeSlots] = useState<CinemaFreeSlotsResponse | null>(null);
  const [busy, setBusy] = useState<"preview" | "free" | null>(null);
  const [localError, setLocalError] = useState("");
  const selectedMovie = movies.find((movie) => movie.id === movieId);
  const body: CinemaBulkShowtimeRequest = { movieId, cinemaId, date, count, format, turnaroundMinutes, ...(pricingOverridesEnabled && { basePrice, vipMultiplier, coupleMultiplier }) };
  async function previewSchedule() { setBusy("preview"); setLocalError(""); try { setPreview(await api.previewCinemaBulkShowtimes(body)); } catch (cause) { setLocalError(mutationMessage(cause)); setPreview(null); } finally { setBusy(null); } }
  async function loadFreeSlots() { if (!cinemaId || !selectedMovie) return; setBusy("free"); setLocalError(""); try { setFreeSlots(await api.cinemaFreeSlots(cinemaId, { date, durationMinutes: selectedMovie.duration, turnaroundMinutes })); } catch (cause) { setLocalError(errorMessage(cause, "Không thể tải khung giờ trống của rạp.")); setFreeSlots(null); } finally { setBusy(null); } }
  async function submit(event: FormEvent) { event.preventDefault(); if (!preview?.valid) { await previewSchedule(); return; } await onSubmit(body); }
  return <Modal eyebrow="LẬP LỊCH ĐA PHÒNG" title="Tạo suất chiếu trong toàn rạp" onClose={onCancel} className="bulk-showtime-modal"><form className="admin-form" onSubmit={(event) => void submit(event)}><div className="admin-form-grid"><Field label="Phim" wide><select required value={movieId} onChange={(event) => { setMovieId(event.target.value); setPreview(null); }}><option value="">Chọn phim đã phát hành</option>{movies.filter((movie) => movie.status === "PUBLISHED").map((movie) => <option key={movie.id} value={movie.id}>{movie.title} · {movie.duration} phút</option>)}</select></Field><Field label="Cụm rạp" wide><select required value={cinemaId} onChange={(event) => { setCinemaId(event.target.value); setPreview(null); setFreeSlots(null); }}><option value="">Chọn cụm rạp</option>{cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select></Field><Field label="Ngày chiếu"><input required type="date" value={date} onChange={(event) => { setDate(event.target.value); setPreview(null); setFreeSlots(null); }} /></Field><NumberField label="Tổng số suất" min={1} max={100} value={count} onChange={(value) => { setCount(value); setPreview(null); }} /><NumberField label="Thời gian nghỉ (phút)" min={0} max={180} value={turnaroundMinutes} onChange={(value) => { setTurnaroundMinutes(value); setPreview(null); setFreeSlots(null); }} /><Field label="Định dạng suất chiếu"><select value={format} onChange={(event) => { setFormat(event.target.value as typeof format); setPreview(null); }}>{showtimeFormats.map((value) => <option key={value} value={value}>{showtimeFormatText[value]}</option>)}</select></Field><label className="admin-field admin-field-wide admin-checkbox-field"><span>Giá vé</span><span className="admin-checkbox-control"><input type="checkbox" checked={pricingOverridesEnabled} onChange={(event) => { setPricingOverridesEnabled(event.target.checked); setPreview(null); }} /> Áp dụng một mức giá override cho toàn bộ phòng</span></label>{pricingOverridesEnabled && <><NumberField label="Giá cơ bản override" min={0} step={1000} value={basePrice} onChange={(value) => { setBasePrice(value); setPreview(null); }} /><NumberField label="Hệ số VIP override" min={0} step={0.01} value={vipMultiplier} onChange={(value) => { setVipMultiplier(value); setPreview(null); }} /><NumberField label="Hệ số ghế đôi override" min={0} step={0.01} value={coupleMultiplier} onChange={(value) => { setCoupleMultiplier(value); setPreview(null); }} /></>}</div><p className="form-hint">Mặc định dùng chính sách theo từng phòng và ngày chiếu. Bật override chỉ khi muốn áp dụng cùng một mức giá cho toàn bộ suất.</p>{(localError || error) && <p className="form-error">{localError || error}</p>}<div className="free-slots-box"><div className="free-slots-head"><strong>Khung giờ khả dụng theo phòng</strong><span>Các giờ bên dưới đã loại trừ suất bận và thời gian nghỉ; mỗi phòng chỉ hiện lịch có thể xếp liên tiếp.</span></div><div className="free-slots-controls"><button className="secondary" type="button" disabled={!cinemaId || !selectedMovie || busy !== null} onClick={() => void loadFreeSlots()}>{busy === "free" ? "Đang tìm…" : "Xem khung giờ từng phòng"}</button></div>{freeSlots && <div className="free-slots-list">{freeSlots.rooms.map((room) => <section className="free-room" key={room.roomId}><div className="free-room-heading"><strong>{room.roomName}</strong><span>{roomFormatText[room.roomFormat]} · {room.freeSlots.length} suất khả dụng</span></div>{room.freeSlots.length ? <div className="free-room-slots">{room.freeSlots.map((slot) => <span className="free-slot-chip" key={`${room.roomId}-${slot.startsAt}`}><strong>{formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}</strong></span>)}</div> : <p className="free-slots-empty">Không còn khung giờ phù hợp.</p>}</section>)}</div>}{freeSlots && freeSlots.schedulableCount < count && <p className="form-error">Chỉ còn trống {freeSlots.schedulableCount} suất chiếu, không đủ {count} suất đã yêu cầu.</p>}</div>{preview && <div className={`bulk-preview ${preview.valid ? "valid" : "invalid"}`}><strong>{preview.valid ? `Sẵn sàng tạo ${preview.assignments.length} suất chiếu` : `Chỉ có thể tạo ${preview.assignments.length}/${preview.requestedCount} suất chiếu`}</strong><p className="bulk-preview-capacity">Tổng sức chứa theo lịch: {preview.schedulableCount} suất · Giá được tính theo từng phòng.</p><div className="bulk-preview-list">{preview.assignments.map((slot, index) => <span className="available" key={`${slot.roomId}-${slot.startsAt}`}><strong>Suất {index + 1} · {slot.roomName}</strong><span>{formatTime(slot.startsAt)} – {formatTime(slot.endsAt)} · {roomFormatText[slot.roomFormat]} · Standard {money(slot.prices.standard)} · VIP {money(slot.prices.vip)} · Đôi {money(slot.prices.couple)}</span></span>)}</div></div>}<div className="form-actions"><button className="secondary" type="button" disabled={loading || busy !== null} onClick={onCancel}>Hủy</button><button className="secondary" type="button" disabled={!movieId || !cinemaId || busy !== null} onClick={() => void previewSchedule()}>{busy === "preview" ? "Đang kiểm tra…" : "Xem trước"}</button><button className="primary" disabled={loading || busy !== null || !preview?.valid}>{loading ? "Đang tạo…" : "Tạo toàn bộ suất"}</button></div></form></Modal>;
}

export function AdminShowtimesPage() {
  const queryClient = useQueryClient();
  const [movieId, setMovieId] = useState("");
  const [cinemaId, setCinemaId] = useState("");
  const [status, setStatus] = useState<MovieStatus | "">("");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [includePast, setIncludePast] = useState(true);
  const [modal, setModal] = useState<{ mode: FormMode; showtime?: Showtime } | null>(null);
  const [bulkModal, setBulkModal] = useState(false);
  const [cinemaBulkModal, setCinemaBulkModal] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const moviesQuery = useQuery({ queryKey: ["admin-movies", "showtime-options"], queryFn: ({ signal }) => api.adminMovies({ pageSize: 100 }, signal) });
  const cinemasQuery = useQuery({ queryKey: ["admin-cinemas"], queryFn: ({ signal }) => api.cinemas(undefined, signal) });
  const query = useQuery({ queryKey: ["admin-showtimes", movieId, cinemaId, status, specialOnly, includePast], queryFn: ({ signal }) => api.adminShowtimes({ movieId: movieId || undefined, cinemaId: cinemaId || undefined, status: status || undefined, specialOnly: specialOnly || undefined, includePast, pageSize: 100 }, signal) });
  const detailQuery = useQuery({ queryKey: ["admin-showtime", detailId], queryFn: ({ signal }) => api.adminShowtime(detailId, signal), enabled: Boolean(detailId) });
  const saveMutation = useMutation({ mutationFn: ({ id, body }: { id?: string; body: CreateShowtimeRequest | UpdateShowtimeRequest }) => id ? api.updateShowtime(id, body as UpdateShowtimeRequest) : api.createShowtime(body as CreateShowtimeRequest), onSuccess: () => { const message = modal?.mode === "edit" ? "Đã cập nhật suất chiếu." : "Đã tạo suất chiếu."; void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] }); setModal(null); setDetailId(""); setMutationError(""); setSuccessMessage(message); } });
  const cinemaBulkMutation = useMutation({ mutationFn: (body: CinemaBulkShowtimeRequest) => api.createCinemaBulkShowtimes(body), onSuccess: (created) => { void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] }); setCinemaBulkModal(false); setMutationError(""); setSuccessMessage(`Đã tạo ${created.length} suất chiếu đa phòng.`); } });
  const bulkMutation = useMutation({ mutationFn: (body: BulkShowtimeRequest) => api.createBulkShowtimes(body), onSuccess: (created) => { void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] }); setBulkModal(false); setMutationError(""); setSuccessMessage(`Đã tạo ${created.length} suất chiếu.`); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.deleteShowtime(id), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-showtimes"] }); setConfirm(null); setSuccessMessage("Đã xóa suất chiếu."); } });
  const showtimes = query.data?.data ?? [];
  const movies = moviesQuery.data?.data ?? [];
  const cinemas = cinemasQuery.data ?? [];
  const detail = detailQuery.data ?? modal?.showtime;
  const optionsPending = moviesQuery.isPending || cinemasQuery.isPending;
  async function save(body: CreateShowtimeRequest | UpdateShowtimeRequest) { setMutationError(""); try { await saveMutation.mutateAsync({ id: modal?.showtime?.id, body }); } catch (cause) { setMutationError(mutationMessage(cause)); } }
  async function createCinemaBulk(body: CinemaBulkShowtimeRequest) { setMutationError(""); try { await cinemaBulkMutation.mutateAsync(body); } catch (cause) { setMutationError(mutationMessage(cause)); throw cause; } }
  async function createBulk(body: BulkShowtimeRequest) { setMutationError(""); try { await bulkMutation.mutateAsync(body); } catch (cause) { setMutationError(mutationMessage(cause)); throw cause; } }
  function edit(showtime: Showtime) { setMutationError(""); setDetailId(showtime.id); setModal({ mode: "edit", showtime }); }
  function askDelete(showtime: Showtime) { setConfirm({ title: "Xóa suất chiếu?", message: `Suất ${formatTime(showtime.startsAt)} của “${showtime.movie.title}” sẽ bị xóa.`, onConfirm: () => deleteMutation.mutate(showtime.id) }); }
  return <AdminPage>
    <PageHeader eyebrow="LỊCH VẬN HÀNH" title="Suất chiếu"><div className="admin-page-actions"><button className="secondary" type="button" disabled={optionsPending} onClick={() => { setMutationError(""); setCinemaBulkModal(true); }}>+ Lập lịch đa phòng</button><button className="secondary" type="button" disabled={optionsPending} onClick={() => { setMutationError(""); setBulkModal(true); }}>+ Lập lịch một phòng</button><button className="primary" type="button" disabled={optionsPending} onClick={() => { setMutationError(""); setDetailId(""); setModal({ mode: "create" }); }}>+ Thêm suất chiếu</button></div></PageHeader>
    {successMessage && <Alert type="success" onClose={() => setSuccessMessage("")}>{successMessage}</Alert>}
    <Toolbar><select aria-label="Lọc phim" value={movieId} onChange={(event) => setMovieId(event.target.value)}><option value="">Tất cả phim</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select><select aria-label="Lọc cụm rạp" value={cinemaId} onChange={(event) => setCinemaId(event.target.value)}><option value="">Tất cả cụm rạp</option>{cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select><select aria-label="Lọc trạng thái phim" value={status} onChange={(event) => setStatus(event.target.value as MovieStatus | "")}><option value="">Mọi trạng thái phim</option>{movieStatuses.map((value) => <option key={value} value={value}>{movieStatusText(value)}</option>)}</select><label className="admin-checkbox"><input type="checkbox" checked={specialOnly} onChange={(event) => setSpecialOnly(event.target.checked)} />Suất đặc biệt</label><label className="admin-checkbox"><input type="checkbox" checked={includePast} onChange={(event) => setIncludePast(event.target.checked)} /> Bao gồm suất đã bắt đầu</label></Toolbar>
    {(moviesQuery.isError || cinemasQuery.isError) && <ErrorState cause={moviesQuery.error ?? cinemasQuery.error} fallback="Không thể tải bộ lọc lịch chiếu." onRetry={() => { void moviesQuery.refetch(); void cinemasQuery.refetch(); }} />}
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải lịch chiếu." onRetry={() => void query.refetch()} />}
    {query.isPending && <LoadingState label="Đang tải lịch chiếu…" />}
    {query.isSuccess && !showtimes.length && <EmptyState>Không có suất chiếu phù hợp với bộ lọc.</EmptyState>}
    {showtimes.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Phim</th><th>Thời gian</th><th>Phòng chiếu</th><th>Giá cơ bản</th><th /></tr></thead><tbody>{showtimes.map((showtime) => <tr key={showtime.id}><td><strong>{showtime.movie.title}</strong><small>{movieStatusText(showtime.movie.status)}</small></td><td><strong>{formatDate(showtime.startsAt)}</strong><small>Kết thúc {formatTime(showtime.endsAt)}</small></td><td><strong>{showtime.room.name}</strong><small>{showtime.room.cinema?.name ?? `Mã rạp: ${showtime.room.cinemaId}`} · {roomFormatText[showtime.room.format ?? "STANDARD"]} · {showtimeFormatText[showtime.format ?? "TWO_D_SUBTITLED"]}</small></td><td>{money(showtime.basePrice ?? 0)}</td><td><div className="admin-actions"><button className="secondary compact-button" type="button" onClick={() => edit(showtime)}>Sửa</button><button className="danger compact-button" type="button" disabled={deleteMutation.isPending} onClick={() => askDelete(showtime)}>Xóa</button></div></td></tr>)}</tbody></table></div>}
    {cinemaBulkModal && <CinemaBulkShowtimeForm movies={movies} cinemas={cinemas} loading={cinemaBulkMutation.isPending} error={mutationError} onCancel={() => setCinemaBulkModal(false)} onSubmit={createCinemaBulk} />}
    {bulkModal && <BulkShowtimeForm movies={movies} cinemas={cinemas} loading={bulkMutation.isPending} error={mutationError} onCancel={() => setBulkModal(false)} onSubmit={createBulk} />}
    {modal && modal.mode === "create" && <ShowtimeForm mode="create" movies={movies} cinemas={cinemas} loading={saveMutation.isPending} error={mutationError} onCancel={() => setModal(null)} onSubmit={save} />}
    {modal && modal.mode === "edit" && detailQuery.isPending && <Modal eyebrow="CHI TIẾT SUẤT CHIẾU" title="Đang tải suất chiếu" onClose={() => { setModal(null); setDetailId(""); }}><LoadingState label="Đang tải chi tiết suất chiếu…" /></Modal>}
    {modal && modal.mode === "edit" && detailQuery.isError && <Modal eyebrow="CHI TIẾT SUẤT CHIẾU" title="Không thể tải suất chiếu" onClose={() => { setModal(null); setDetailId(""); }}><ErrorState cause={detailQuery.error} fallback="Không thể tải chi tiết suất chiếu." onRetry={() => void detailQuery.refetch()} /></Modal>}
    {modal && modal.mode === "edit" && detail && <ShowtimeForm mode="edit" showtime={detail} movies={movies} cinemas={cinemas} loading={saveMutation.isPending} error={mutationError} onCancel={() => { setModal(null); setDetailId(""); }} onSubmit={save} />}
    {confirm && <ConfirmDialog state={confirm} loading={deleteMutation.isPending} error={deleteMutation.error ? mutationMessage(deleteMutation.error) : undefined} onClose={() => setConfirm(null)} />}
  </AdminPage>;
}
