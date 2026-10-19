import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useDialogFocus } from "../../components/useDialogFocus";
import type { MovieStatus, SeatType, Showtime } from "../../types";
import { errorMessage, formatDate, formatTime } from "../../utils/format";

export type FormMode = "create" | "edit";

export type ConfirmState = {
  title: string;
  message: ReactNode;
  onConfirm: () => void;
};

export type ReasonDialogState = {
  title: string;
  message: ReactNode;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  noteLabel?: string;
  notePlaceholder?: string;
  onSubmit: (reason: string, note?: string) => void;
};

export const movieStatuses: MovieStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
export const seatTypes: SeatType[] = ["STANDARD", "VIP", "COUPLE"];
export const roomFormats = ["STANDARD", "IMAX", "FOUR_DX", "SCREEN_X"] as const;
export const showtimeFormats = ["TWO_D_SUBTITLED", "TWO_D_DUBBED", "THREE_D_SUBTITLED", "THREE_D_DUBBED"] as const;
export const roomFormatText: Record<(typeof roomFormats)[number], string> = { STANDARD: "Tiêu chuẩn", IMAX: "IMAX", FOUR_DX: "4DX", SCREEN_X: "ScreenX" };
export const showtimeFormatText: Record<(typeof showtimeFormats)[number], string> = { TWO_D_SUBTITLED: "2D · Phụ đề", TWO_D_DUBBED: "2D · Lồng tiếng", THREE_D_SUBTITLED: "3D · Phụ đề", THREE_D_DUBBED: "3D · Lồng tiếng" };
export const editableSeatTypes: SeatType[] = ["STANDARD", "VIP"];
export const bookingStatusText: Record<string, string> = { PENDING: "Chờ thanh toán", CONFIRMED: "Đã xác nhận", CANCELLED: "Đã hủy", EXPIRED: "Đã hết hạn" };
export const paymentStatusText: Record<string, string> = { PENDING: "Đang xử lý", SUCCEEDED: "Thành công", FAILED: "Thất bại", REFUNDED: "Đã hoàn tiền" };
export const ticketStatusText: Record<string, string> = { ACTIVE: "Đang hoạt động", USED: "Đã dùng", CANCELLED: "Đã hủy" };
export const roleText: Record<string, string> = { CUSTOMER: "Khách hàng", ADMIN: "Quản trị viên" };
export const permissionText: Record<string, string> = { MANAGE_MOVIES: "Quản lý phim", MANAGE_CINEMAS: "Quản lý cụm rạp", MANAGE_SHOWTIMES: "Quản lý suất chiếu", VIEW_BOOKINGS: "Xem đặt vé", MANAGE_PAYMENTS: "Quản lý thanh toán", VIEW_SYSTEM: "Xem hệ thống", MANAGE_USERS: "Quản lý người dùng", VIEW_AUDIT_LOGS: "Xem nhật ký thao tác" };

export function movieStatusText(status: MovieStatus) {
  return status === "DRAFT"
    ? "Bản nháp"
    : status === "PUBLISHED"
      ? "Đang chiếu"
      : "Đã lưu trữ";
}

export function seatTypeText(type: SeatType) {
  return type === "STANDARD" ? "Tiêu chuẩn" : type === "VIP" ? "VIP" : "Đôi";
}

export function AdminPage({ children }: { children: ReactNode }) {
  return <section className="admin-page">{children}</section>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="admin-toolbar">{children}</div>;
}

export function Modal({
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

export function ConfirmDialog({
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
        <div className="admin-copy">{state.message}</div>
        {error && <p className="form-error" role="alert">{error}</p>}
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
            onClick={() => {
              void Promise.resolve(state.onConfirm()).catch(() => undefined);
            }}
          >
            {loading ? "Đang xử lý…" : "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReasonDialog({
  state,
  loading,
  error,
  onClose,
}: {
  state: ReasonDialogState;
  loading: boolean;
  error?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  useDialogFocus(true, dialogRef, onClose);
  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={dialogRef} className="admin-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title" tabIndex={-1}>
        <button className="modal-close" type="button" aria-label="Đóng" onClick={onClose}>×</button>
        <p className="eyebrow">THÔNG TIN THAO TÁC</p>
        <h2 id="reason-dialog-title">{state.title}</h2>
        <div className="admin-copy">{state.message}</div>
        <label className="admin-field admin-field-wide">
          <span>{state.reasonLabel ?? "Lý do"} <strong aria-hidden="true">*</strong></span>
          <textarea ref={reasonRef} required rows={3} value={reason} placeholder={state.reasonPlaceholder} onChange={(event) => setReason(event.target.value)} />
        </label>
        {state.noteLabel && <label className="admin-field admin-field-wide"><span>{state.noteLabel}</span><textarea rows={2} value={note} placeholder={state.notePlaceholder} onChange={(event) => setNote(event.target.value)} /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="secondary" type="button" disabled={loading} onClick={onClose}>Hủy</button>
          <button className="danger" type="button" disabled={loading || !reason.trim()} onClick={() => {
            void Promise.resolve(state.onSubmit(reason.trim(), note.trim() || undefined)).catch(() => undefined);
          }}>{loading ? "Đang xử lý…" : "Xác nhận"}</button>
        </div>
      </div>
    </div>
  );
}

export function Field({
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

export function FormActions({
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

export function NumberField({
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

export function CharacterTextarea({
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

export function mutationMessage(cause: unknown) {
  return errorMessage(cause, "Không thể hoàn tất thao tác.");
}

export function youtubeKey(value: string | null | undefined) {
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

export function dashboardShowtimeStatus(showtime: Showtime) {
  const now = Date.now();
  const startsAt = new Date(showtime.startsAt).getTime();
  const endsAt = new Date(showtime.endsAt).getTime();
  if (now >= startsAt && now < endsAt) return { label: "Đang diễn ra", tone: "live" };
  if (startsAt > now && startsAt - now <= 30 * 60 * 1000) return { label: "Sắp diễn ra", tone: "soon" };
  return { label: "Đã lên lịch", tone: "scheduled" };
}

export { formatDate, formatTime };
