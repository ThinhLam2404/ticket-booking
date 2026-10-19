import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api";
import { useLocationContext } from "../../../auth/LocationContext";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../../../components/ui";
import type {
  Cinema,
  CreateCinemaRequest,
  CreateRoomRequest,
  CreateSeatRequest,
  RoomResponse,
  Seat,
  SeatType,
  UpdateCinemaRequest,
} from "../../../types";
import { formatDate } from "../../../utils/format";
import { buildSeatLayout, isCompleteSeatLayout, validateSeatPreset } from "../../../utils/seat-layout";
import {
  AdminPage,
  ConfirmDialog,
  editableSeatTypes,
  Field,
  FormActions,
  Modal,
  mutationMessage,
  NumberField,
  roomFormats,
  roomFormatText,
  seatTypes,
  seatTypeText,
  type ConfirmState,
  type FormMode,
  CharacterTextarea,
} from "../shared";

const emptySeats: Seat[] = [];

type CinemaFormProps = {
  mode: FormMode;
  cinema?: Cinema;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: CreateCinemaRequest) => Promise<void>;
};

function CinemaForm({ mode, cinema, loading, error, onCancel, onSubmit }: CinemaFormProps) {
  const { provinces, isPending: provincesPending } = useLocationContext();
  const [form, setForm] = useState<CreateCinemaRequest>({ name: cinema?.name ?? "", address: cinema?.address ?? "", provinceCode: cinema?.provinceCode ?? 79 });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit(form);
  }

  return <Modal eyebrow={mode === "create" ? "CỤM RẠP MỚI" : "CHỈNH SỬA CỤM RẠP"} title={mode === "create" ? "Thêm cụm rạp" : "Cập nhật cụm rạp"} onClose={onCancel}>
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <div className="admin-form-grid">
        <Field label="Tên cụm rạp" wide><input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Tỉnh/thành" wide><select required disabled={provincesPending} value={form.provinceCode} onChange={(event) => setForm({ ...form, provinceCode: Number(event.target.value) })}>{provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}</select></Field>
        <CharacterTextarea label="Địa chỉ chi tiết" required maxLength={500} rows={4} value={form.address} onChange={(address) => setForm({ ...form, address })} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <FormActions loading={loading} onCancel={onCancel} submitLabel={mode === "create" ? "Tạo cụm rạp" : "Lưu thay đổi"} />
    </form>
  </Modal>;
}

export function AdminCinemasPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ mode: FormMode; cinema?: Cinema } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [pendingCinemaActions, setPendingCinemaActions] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [provinceCode, setProvinceCode] = useState<number | "">("");
  const { provinces, isPending: provincesPending, isError: provincesError, refetch: refetchProvinces } = useLocationContext();
  const query = useQuery({ queryKey: ["admin-cinemas", provinceCode], queryFn: ({ signal }) => api.cinemas(provinceCode === "" ? undefined : provinceCode, signal) });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateCinemaRequest }) => id ? api.updateCinema(id, body as UpdateCinemaRequest) : api.createCinema(body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] }); setModal(null); setMutationError(""); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCinema(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] }); setConfirm(null); },
  });
  const cinemas = query.data ?? [];
  const filteredCinemas = cinemas.filter((cinema) => `${cinema.name} ${cinema.address} ${cinema.province?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function save(body: CreateCinemaRequest) {
    setMutationError("");
    try { await saveMutation.mutateAsync({ id: modal?.cinema?.id, body }); } catch (cause) { setMutationError(mutationMessage(cause)); }
  }

  function askDelete(cinema: Cinema) {
    setConfirm({ title: "Xóa cụm rạp?", message: `Thao tác này sẽ xóa “${cinema.name}” nếu cụm rạp chưa có dữ liệu liên quan.`, onConfirm: () => {
      if (pendingCinemaActions.has(cinema.id)) return;
      setPendingCinemaActions((current) => new Set(current).add(cinema.id));
      void deleteMutation.mutateAsync(cinema.id).catch((cause) => setMutationError(mutationMessage(cause))).finally(() => {
        setPendingCinemaActions((current) => { const next = new Set(current); next.delete(cinema.id); return next; });
      });
    } });
  }

  return <AdminPage>
    <PageHeader eyebrow="MẠNG LƯỚI CINEBOOK" title="Cụm rạp"><button className="primary" type="button" onClick={() => { setMutationError(""); setModal({ mode: "create" }); }}>+ Thêm cụm rạp</button></PageHeader>
    {query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách cụm rạp." onRetry={() => void query.refetch()} />}
    {query.isPending && <LoadingState label="Đang tải danh sách cụm rạp…" />}
    {query.isSuccess && !cinemas.length && <EmptyState>Chưa có cụm rạp. Hãy tạo cụm rạp đầu tiên.</EmptyState>}
    <div className="admin-toolbar admin-cinema-toolbar"><input aria-label="Tìm cụm rạp" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên cụm rạp hoặc địa chỉ…" /><select aria-label="Lọc tỉnh thành" value={provinceCode} disabled={provincesPending} onChange={(event) => setProvinceCode(event.target.value ? Number(event.target.value) : "")}><option value="">Tất cả tỉnh/thành</option>{provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}</select><span className="admin-toolbar-result">{filteredCinemas.length} cụm rạp</span></div>
    {provincesError && <ErrorState cause={new Error("Province list unavailable")} fallback="Không thể tải bộ lọc tỉnh/thành." onRetry={() => void refetchProvinces()} />}
    {query.isSuccess && !filteredCinemas.length && <EmptyState>{search || provinceCode !== "" ? "Không tìm thấy cụm rạp phù hợp." : "Chưa có cụm rạp. Hãy tạo cụm rạp đầu tiên."}</EmptyState>}
    {filteredCinemas.length > 0 && <div className="admin-card-grid">{filteredCinemas.map((cinema, index) => <article className="admin-entity-card" key={cinema.id}><div className="admin-card-mark">{cinema.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase()}</div><div className="admin-entity-content"><div className="admin-card-heading"><div><p className="eyebrow">CỤM RẠP {String(index + 1).padStart(2, "0")}</p><h2>{cinema.name}</h2></div><span className="admin-count">{cinema.roomCount ?? 0} phòng</span></div><div className="admin-card-tags"><span>{cinema.province?.name ?? `Mã tỉnh ${cinema.provinceCode}`}</span><span className="admin-card-status">Đang quản lý</span></div><p className="admin-address">⌖ {cinema.address}</p><div className="admin-card-footer"><Link className="primary" to={`/admin/cinemas/${cinema.id}/rooms`}>Quản lý phòng</Link><button className="secondary" type="button" onClick={() => { setMutationError(""); setModal({ mode: "edit", cinema }); }}>Sửa</button><button className="danger" type="button" disabled={deleteMutation.isPending && deleteMutation.variables === cinema.id} onClick={() => askDelete(cinema)}>Xóa</button></div></div></article>)}</div>}
    {modal && <CinemaForm mode={modal.mode} cinema={modal.cinema} loading={saveMutation.isPending} error={mutationError} onCancel={() => setModal(null)} onSubmit={save} />}
    {confirm && <ConfirmDialog state={confirm} loading={deleteMutation.isPending} error={deleteMutation.error ? mutationMessage(deleteMutation.error) : undefined} onClose={() => setConfirm(null)} />}
  </AdminPage>;
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

function RoomForm({ mode, cinemaId, room, loading, error, onCancel, onSubmit }: RoomFormProps) {
  const [name, setName] = useState(room?.name ?? "");
  const [format, setFormat] = useState(room?.format ?? "STANDARD");
  async function submit(event: FormEvent) { event.preventDefault(); await onSubmit({ name, cinemaId, format }); }
  return <Modal eyebrow={mode === "create" ? "PHÒNG CHIẾU MỚI" : "CHỈNH SỬA PHÒNG"} title={mode === "create" ? "Thêm phòng chiếu" : "Cập nhật phòng chiếu"} onClose={onCancel}><form className="admin-form" onSubmit={(event) => void submit(event)}><Field label="Tên phòng chiếu"><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Định dạng phòng"><select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>{roomFormats.map((value) => <option key={value} value={value}>{roomFormatText[value]}</option>)}</select></Field>{error && <p className="form-error">{error}</p>}<FormActions loading={loading} onCancel={onCancel} submitLabel={mode === "create" ? "Tạo phòng" : "Lưu thay đổi"} /></form></Modal>;
}

export function AdminRoomsPage() {
  const { cinemaId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ mode: FormMode; room?: RoomResponse } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [pendingRoomActions, setPendingRoomActions] = useState<Set<string>>(new Set());
  const cinemaQuery = useQuery({ queryKey: ["admin-cinema", cinemaId], queryFn: ({ signal }) => api.cinema(cinemaId!, signal), enabled: Boolean(cinemaId) });
  const roomsQuery = useQuery({ queryKey: ["admin-rooms", cinemaId], queryFn: ({ signal }) => api.rooms(cinemaId!, signal), enabled: Boolean(cinemaId) });
  const roomDetailQuery = useQuery({ queryKey: ["admin-room", modal?.room?.id], queryFn: ({ signal }) => api.room(modal!.room!.id, signal), enabled: Boolean(modal?.room?.id) });
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateRoomRequest }) => id ? api.updateRoom(id, { name: body.name, format: body.format }) : api.createRoom(body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-rooms", cinemaId] }); void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] }); setModal(null); setMutationError(""); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRoom(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-rooms", cinemaId] }); void queryClient.invalidateQueries({ queryKey: ["admin-cinemas"] }); setConfirm(null); },
  });
  const rooms = roomsQuery.data ?? [];
  const selectedRoom = roomDetailQuery.data ?? modal?.room;
  async function save(body: CreateRoomRequest) { setMutationError(""); try { await saveMutation.mutateAsync({ id: modal?.room?.id, body }); } catch (cause) { setMutationError(mutationMessage(cause)); } }
  function askDelete(room: RoomResponse) { setConfirm({ title: "Xóa phòng chiếu?", message: `Phòng “${room.name}” chỉ có thể xóa khi chưa có suất chiếu liên quan.`, onConfirm: () => {
    if (pendingRoomActions.has(room.id)) return;
    setPendingRoomActions((current) => new Set(current).add(room.id));
    void deleteMutation.mutateAsync(room.id).catch((cause) => setMutationError(mutationMessage(cause))).finally(() => {
      setPendingRoomActions((current) => { const next = new Set(current); next.delete(room.id); return next; });
    });
  } }); }

  if (!cinemaId) return <AdminPage><ErrorState cause={new Error("Thiếu cụm rạp")} fallback="Không xác định được cụm rạp." onRetry={() => navigate("/admin/cinemas")} /></AdminPage>;
  return <AdminPage>
    <div className="admin-breadcrumb"><Link to="/admin/cinemas">Cụm rạp</Link><span>›</span><strong>{cinemaQuery.data?.name ?? "Phòng chiếu"}</strong></div>
    <PageHeader eyebrow="VẬN HÀNH CỤM RẠP" title={cinemaQuery.data?.name ?? "Phòng chiếu"}><button className="primary" type="button" onClick={() => { setMutationError(""); setModal({ mode: "create" }); }}>+ Thêm phòng</button></PageHeader>
    <p className="admin-lead">{cinemaQuery.data?.address ?? "Quản lý tên phòng và sơ đồ ghế."}</p>
    {cinemaQuery.isError && <ErrorState cause={cinemaQuery.error} fallback="Không thể tải thông tin cụm rạp." onRetry={() => void cinemaQuery.refetch()} />}
    {roomsQuery.isError && <ErrorState cause={roomsQuery.error} fallback="Không thể tải danh sách phòng." onRetry={() => void roomsQuery.refetch()} />}
    {roomsQuery.isPending && <LoadingState label="Đang tải danh sách phòng…" />}
    {roomsQuery.isSuccess && !rooms.length && <EmptyState>Cụm rạp này chưa có phòng chiếu.</EmptyState>}
    {rooms.length > 0 && <div className="admin-room-list">{rooms.map((room) => <article className="admin-room-row" key={room.id}><div><p className="eyebrow">PHÒNG CHIẾU</p><h2>{room.name}</h2><span className="admin-room-format">{roomFormatText[room.format]} · {room.seatCount ?? room.seats?.length ?? 0} ghế</span><span>Cập nhật {formatDate(room.updatedAt)}</span></div><div className="admin-actions"><Link className="primary compact-button" to={`/admin/rooms/${room.id}/seats`}>Sơ đồ ghế</Link><button className="secondary compact-button" type="button" onClick={() => { setMutationError(""); setModal({ mode: "edit", room }); }}>Sửa</button><button className="danger compact-button" type="button" disabled={deleteMutation.isPending && deleteMutation.variables === room.id} onClick={() => askDelete(room)}>Xóa</button></div></article>)}</div>}
    {modal && modal.mode === "create" && <RoomForm mode="create" cinemaId={cinemaId} loading={saveMutation.isPending} error={mutationError} onCancel={() => setModal(null)} onSubmit={save} />}
    {modal && modal.mode === "edit" && roomDetailQuery.isPending && <Modal eyebrow="CHI TIẾT PHÒNG" title="Đang tải phòng chiếu" onClose={() => setModal(null)}><LoadingState label="Đang tải chi tiết phòng…" /></Modal>}
    {modal && modal.mode === "edit" && roomDetailQuery.isError && <Modal eyebrow="CHI TIẾT PHÒNG" title="Không thể tải phòng chiếu" onClose={() => setModal(null)}><ErrorState cause={roomDetailQuery.error} fallback="Không thể tải chi tiết phòng." onRetry={() => void roomDetailQuery.refetch()} /></Modal>}
    {modal && modal.mode === "edit" && roomDetailQuery.isSuccess && selectedRoom && <RoomForm mode="edit" cinemaId={cinemaId} room={selectedRoom} loading={saveMutation.isPending} error={mutationError} onCancel={() => setModal(null)} onSubmit={save} />}
    {confirm && <ConfirmDialog state={confirm} loading={deleteMutation.isPending} error={deleteMutation.error ? mutationMessage(deleteMutation.error) : undefined} onClose={() => setConfirm(null)} />}
  </AdminPage>;
}

type SeatFormProps = { seat?: Seat; loading: boolean; error?: string; onSubmit: (body: CreateSeatRequest) => Promise<void>; onCancel: () => void };

function SeatForm({ seat, loading, error, onSubmit, onCancel }: SeatFormProps) {
  const [row, setRow] = useState(seat?.row ?? "A");
  const [number, setNumber] = useState(seat?.number ?? 1);
  const [type, setType] = useState<SeatType>(seat?.type === "VIP" ? "VIP" : "STANDARD");
  async function submit(event: FormEvent) { event.preventDefault(); await onSubmit({ row: row.toUpperCase(), number, type }); }
  return <Modal eyebrow={seat ? "CHỈNH SỬA GHẾ" : "GHẾ MỚI"} title={seat ? `Ghế ${seat.row}${seat.number}` : "Thêm ghế"} onClose={onCancel}><form className="admin-form" onSubmit={(event) => void submit(event)}><div className="admin-form-grid"><Field label="Hàng"><input required maxLength={3} value={row} onChange={(event) => setRow(event.target.value)} /></Field><NumberField label="Số ghế" min={1} max={100} value={number} onChange={setNumber} /><Field label="Loại ghế"><select value={type} onChange={(event) => setType(event.target.value as SeatType)}>{editableSeatTypes.map((value) => <option key={value} value={value}>{seatTypeText(value)}</option>)}</select></Field><p className="form-hint">Ghế đôi phải được tạo theo cặp bằng chức năng tạo nhanh sơ đồ.</p></div>{error && <p className="form-error">{error}</p>}<FormActions loading={loading} onCancel={onCancel} submitLabel={seat ? "Lưu thay đổi" : "Tạo ghế"} /></form></Modal>;
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
  const roomQuery = useQuery({ queryKey: ["admin-room", roomId], queryFn: ({ signal }) => api.room(roomId!, signal), enabled: Boolean(roomId) });
  const seatsQuery = useQuery({ queryKey: ["admin-seats", roomId], queryFn: ({ signal }) => api.seats(roomId!, signal), enabled: Boolean(roomId) });
  const saveMutation = useMutation({ mutationFn: ({ id, body }: { id?: string; body: CreateSeatRequest }) => id ? api.updateSeat(id, { type: body.type }) : api.createSeat(roomId!, body), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-seats", roomId] }); setEditing(null); setMutationError(""); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.deleteSeat(id), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-seats", roomId] }); setConfirm(null); }, onError: (cause) => setMutationError(mutationMessage(cause)) });
  const layoutMutation = useMutation({ mutationFn: (layout: CreateSeatRequest[]) => api.replaceSeatLayout(roomId!, layout), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-seats", roomId] }); setConfirm(null); setMutationError(""); }, onError: (cause) => setMutationError(mutationMessage(cause)) });
  const seats = seatsQuery.data ?? emptySeats;
  const completeLayout = isCompleteSeatLayout(seats);
  const groupedSeats = useMemo(() => seats.reduce<Record<string, Seat[]>>((groups, seat) => { groups[seat.row] = [...(groups[seat.row] ?? []), seat]; return groups; }, {}), [seats]);
  async function save(body: CreateSeatRequest) { setMutationError(""); try { await saveMutation.mutateAsync({ id: editing?.id, body }); } catch (cause) { setMutationError(mutationMessage(cause)); } }
  function makeLayout() { return buildSeatLayout({ rows, regularColumns, coupleColumns }); }
  function askLayout() { const validationError = validateSeatPreset({ rows, regularColumns, coupleColumns }); if (validationError) { setMutationError(validationError); return; } setConfirm({ title: "Thay thế toàn bộ sơ đồ?", message: `Sơ đồ gồm ${rows} hàng; ${regularColumns} ghế Standard/VIP và ${coupleColumns} ghế Couple ở hàng cuối.`, onConfirm: () => layoutMutation.mutateAsync(makeLayout()) }); }
  function askDelete(seat: Seat) { if (completeLayout) { setMutationError('Layout hoàn chỉnh chỉ được thay đổi bằng chức năng bulk layout.'); return; } setConfirm({ title: "Xóa ghế?", message: `Ghế ${seat.row}${seat.number} sẽ được xóa khỏi phòng chiếu.`, onConfirm: () => deleteMutation.mutateAsync(seat.id) }); }
  if (!roomId) return <AdminPage><ErrorState cause={new Error("Thiếu phòng")} fallback="Không xác định được phòng chiếu." /></AdminPage>;
  return <AdminPage>
    <div className="admin-breadcrumb"><Link to="/admin/cinemas">Cụm rạp</Link><span>›</span><strong>{roomQuery.data?.name ?? "Sơ đồ ghế"}</strong></div>
    <PageHeader eyebrow="SƠ ĐỒ GHẾ" title={roomQuery.data?.name ?? "Phòng chiếu"}><button className="primary" type="button" disabled={completeLayout} onClick={() => { setMutationError(""); setEditing({ id: "", row: "A", number: 1, type: "STANDARD", roomId }); }}>+ Thêm ghế</button></PageHeader>
    {roomQuery.isError && <ErrorState cause={roomQuery.error} fallback="Không thể tải thông tin phòng." onRetry={() => void roomQuery.refetch()} />}
    <div className="admin-seat-layout"><div className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">BULK LAYOUT</p><h2>Tạo nhanh sơ đồ</h2></div><span>{seats.length} ghế hiện tại</span></div><div className="admin-form-grid"><NumberField label="Số hàng" min={5} max={26} value={rows} onChange={setRows} /><NumberField label="Ghế Standard/VIP" min={1} max={100} value={regularColumns} onChange={setRegularColumns} /><NumberField label="Ghế Couple (hàng cuối)" min={2} max={100} step={2} value={coupleColumns} onChange={setCoupleColumns} /></div><button className="secondary" type="button" disabled={layoutMutation.isPending || rows < 5 || regularColumns < 1 || coupleColumns < 2 || coupleColumns % 2 !== 0} onClick={askLayout}>{layoutMutation.isPending ? "Đang cập nhật…" : "Thay thế sơ đồ"}</button></div>
      {seatsQuery.isError && <ErrorState cause={seatsQuery.error} fallback="Không thể tải sơ đồ ghế." onRetry={() => void seatsQuery.refetch()} />}
      {seatsQuery.isPending && <LoadingState label="Đang tải sơ đồ ghế…" />}
      {seatsQuery.isSuccess && !seats.length && <EmptyState>Phòng chiếu chưa có ghế. Tạo nhanh một sơ đồ ở trên.</EmptyState>}
      {seats.length > 0 && <div className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">SEAT MAP</p><h2>Sơ đồ đang dùng</h2></div><span>Chọn một ghế để chỉnh sửa</span></div><div className="admin-seat-map">{Object.entries(groupedSeats).sort(([a], [b]) => a.localeCompare(b)).map(([row, rowSeats]) => <div className="admin-seat-row" key={row}><b>{row}</b>{rowSeats.sort((a, b) => a.number - b.number).map((seat) => <button className={`admin-seat admin-seat-${seat.type.toLowerCase()}`} type="button" key={seat.id} onClick={() => { if (completeLayout || seat.type === "COUPLE") return; setMutationError(""); setEditing(seat); }}>{seat.number}<span>{seat.type === "VIP" ? "V" : seat.type === "COUPLE" ? "Đ" : ""}</span></button>)}</div>)}</div></div>}
    </div>
    {seats.length > 0 && <section className="admin-seat-actions"><div className="admin-seat-actions-heading"><div><p className="eyebrow">THAO TÁC GHẾ</p><h2>Danh sách ghế</h2><p>Chọn ghế trên sơ đồ để chỉnh sửa nhanh hoặc quản lý từng vị trí tại đây.</p></div><span className="admin-count">{seats.length} vị trí</span></div><div className="admin-seat-legend">{seatTypes.map((type) => <span key={type}><i className={`admin-seat-dot admin-seat-dot-${type.toLowerCase()}`} />{seatTypeText(type)}</span>)}</div><div className="admin-seat-delete-list">{seats.slice().sort((a, b) => `${a.row}${a.number}`.localeCompare(`${b.row}${b.number}`, undefined, { numeric: true })).map((seat) => <div key={seat.id} className="admin-seat-action-row"><span className={`admin-seat-token admin-seat-token-${seat.type.toLowerCase()}`}>{seat.row}{seat.number}</span><span className="admin-seat-action-copy"><strong>Ghế {seat.row}{seat.number}</strong><small>{seatTypeText(seat.type)}</small></span>{completeLayout || seat.type === "COUPLE" ? <span className="admin-seat-managed">Theo layout</span> : <><button className="secondary compact-button" type="button" onClick={() => { setMutationError(""); setEditing(seat); }}>Sửa</button><button className="danger compact-button" type="button" disabled={deleteMutation.isPending && deleteMutation.variables === seat.id} onClick={() => askDelete(seat)}>Xóa</button></>}</div>)}</div></section>}
    {editing && <SeatForm seat={editing.id ? editing : undefined} loading={saveMutation.isPending} error={mutationError} onCancel={() => setEditing(null)} onSubmit={save} />}
    {confirm && <ConfirmDialog state={confirm} loading={deleteMutation.isPending || layoutMutation.isPending} error={deleteMutation.error ? mutationMessage(deleteMutation.error) : layoutMutation.error ? mutationMessage(layoutMutation.error) : undefined} onClose={() => setConfirm(null)} />}
  </AdminPage>;
}
