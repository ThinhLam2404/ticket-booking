import { useState } from "react";
import { ComboSummary } from '../../booking/ComboSummary';
import type { ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api";
import { LoadingState, ErrorState, EmptyState } from "../../../components/ui";
import { money, formatDate, formatTime } from "../../../utils/format";
import {
  AdminPage,
  ConfirmDialog,
  ReasonDialog,
  bookingStatusText,
  movieStatusText,
  paymentStatusText,
  seatTypeText,
  ticketStatusText,
} from "../shared";

type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED";

function statusBadge(status: BookingStatus) {
  return (
    <span className={`status ${status.toLowerCase()}`}>
      {bookingStatusText[status]}
    </span>
  );
}

function seatTypeBadge(type: string) {
  return (
    <span className="seat-type-badge">
      {seatTypeText(type as "STANDARD" | "VIP" | "COUPLE")}
    </span>
  );
}

export function AdminBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<{
    title: string;
    message: ReactNode;
    onConfirm: () => void;
  } | null>(null);
  const [refundReasonDialog, setRefundReasonDialog] = useState(false);

  const bookingQuery = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: ({ signal }) => api.adminBooking(id!, signal),
    enabled: !!id,
  });

  const refundMutation = useMutation({
    mutationFn: (dto: { reason: string; adminNote?: string }) =>
      api.adminRefundBooking(id!, dto),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-booking", id] }),
        queryClient.invalidateQueries({
          queryKey: ["admin-sepay-transactions"],
        }),
      ]);
      setConfirm(null);
      setRefundReasonDialog(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelBooking(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
      setConfirm(null);
    },
  });

  const booking = bookingQuery.data;

  if (!id) return null;

  if (bookingQuery.isPending)
    return <LoadingState label="Đang tải chi tiết đặt vé…" />;
  if (bookingQuery.isError)
    return (
      <ErrorState
        cause={bookingQuery.error}
        fallback="Không thể tải chi tiết đặt vé."
        onRetry={() => void bookingQuery.refetch()}
      />
    );
  if (!booking) return <EmptyState>Không tìm thấy đặt vé.</EmptyState>;

  const showtime = booking.showtime;
  const movie = showtime?.movie;
  const room = showtime?.room;
  const cinema = room?.cinema;

  const canRefund =
    booking.payment?.status === "SUCCEEDED" &&
    booking.status === "CONFIRMED" &&
    !booking.tickets.some((t) => t.status === "USED");
  const canCancel = booking.status === "PENDING";

  const handleRefund = () => setRefundReasonDialog(true);

  const handleCancel = () => {
    setConfirm({
      title: "Hủy đặt vé",
      message: (
        <>
          Hủy đặt vé <strong>#{booking.id}</strong>? Ghế sẽ được giải phóng.
        </>
      ),
      onConfirm: () => {
        if (!cancelMutation.isPending) {
          void cancelMutation.mutateAsync().catch(() => undefined);
        }
      },
    });
  };

  const getSeatLabel = (item: (typeof booking.items)[0]) => {
    const seat = item.showtimeSeat?.seat;
    return seat ? `${seat.row}${seat.number}` : "—";
  };

  const getSeatPrice = (item: (typeof booking.items)[0]) => {
    return item.price;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    return `${formatDate(value)} ${formatTime(value)}`;
  };

  return (
    <AdminPage>
      <ComboSummary booking={booking} />
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">VẬN HÀNH / ĐẶT VÉ</p>
          <h1>
            Chi tiết đặt vé <code>#{booking.id}</code>
          </h1>
        </div>
        <div className="header-actions">
          <Link to="/admin/bookings" className="secondary">
            ← Quay lại danh sách
          </Link>
          {canRefund && (
            <button
              className="danger"
              onClick={handleRefund}
              disabled={refundMutation.isPending}
            >
              Hoàn tiền
            </button>
          )}
          {canCancel && (
            <button
              className="secondary"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              Hủy đặt vé
            </button>
          )}
        </div>
      </div>

      <div className="admin-detail-grid">
        <section className="detail-section">
          <div className="detail-card">
            <div className="detail-card-header">
              <p className="eyebrow">THÔNG TIN ĐẶT VÉ</p>
              <div className="status-badge-large">
                {statusBadge(booking.status)}
              </div>
            </div>
            <dl className="detail-grid">
              <dt>Mã đặt vé</dt>
              <dd>
                <strong>#{booking.id}</strong>
              </dd>

              <dt>Khách hàng</dt>
              <dd>
                <div>{booking.userId}</div>
                {booking.payment && (
                  <small className="text-muted">
                    User ID: {booking.userId}
                  </small>
                )}
              </dd>

              <dt>Tổng tiền</dt>
              <dd>
                <strong className="money-large">
                  {money(booking.totalAmount)}
                </strong>
              </dd>

              <dt>Tạo lúc</dt>
              <dd>{formatDateTime(booking.createdAt)}</dd>

              <dt>Hết hạn</dt>
              <dd>{formatDateTime(booking.expiresAt)}</dd>

              <dt>Cập nhật</dt>
              <dd>{formatDateTime(booking.updatedAt)}</dd>
            </dl>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <p className="eyebrow">SUẤT CHIẾU</p>
            </div>
            <dl className="detail-grid">
              <dt>Phim</dt>
              <dd>
                <strong>{movie?.title ?? "—"}</strong>
                {movie && (
                  <small className="text-muted">
                    {movie.duration} phút · {movieStatusText(movie.status)}
                  </small>
                )}
              </dd>

              <dt>Rạp / Phòng</dt>
              <dd>
                <div>{cinema?.name ?? "—"}</div>
                <small className="text-muted">
                  {room?.name ?? "—"} · {room?.format ?? "—"}
                </small>
              </dd>

              <dt>Khung giờ</dt>
              <dd>
                <div>
                  <strong>{formatDate(showtime?.startsAt ?? "")}</strong>{" "}
                  {formatTime(showtime?.startsAt ?? "")} –{" "}
                  {formatTime(showtime?.endsAt ?? "")}
                </div>
                <small className="text-muted">
                  Định dạng: {showtime?.format ?? "—"}
                </small>
              </dd>

              <dt>Giá cơ bản</dt>
              <dd>{money(showtime?.basePrice ?? "0")}</dd>
            </dl>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <p className="eyebrow">GHẾ ĐÃ ĐẶT ({booking.items.length})</p>
            </div>
            {booking.items.length > 0 ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Ghế</th>
                      <th>Loại</th>
                      <th>Giá</th>
                      <th>Trạng thái vé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{getSeatLabel(item)}</strong>
                        </td>
                        <td>
                          {item.showtimeSeat?.seat?.type &&
                            seatTypeBadge(item.showtimeSeat.seat.type)}
                        </td>
                        <td>{money(getSeatPrice(item))}</td>
                        <td>
                          {item.ticket && (
                            <span
                              className={`status ${item.ticket.status.toLowerCase()}`}
                            >
                              {ticketStatusText[item.ticket.status] ??
                                item.ticket.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Không có ghế nào.</EmptyState>
            )}
          </div>

          {booking.payment && (
            <div className="detail-card">
              <div className="detail-card-header">
                <p className="eyebrow">THANH TOÁN</p>
                <span
                  className={`status ${booking.payment.status.toLowerCase()}`}
                >
                  {paymentStatusText[booking.payment.status] ??
                    booking.payment.status}
                </span>
              </div>
              <dl className="detail-grid">
                <dt>Mã thanh toán</dt>
                <dd>
                  <code>{booking.payment.id}</code>
                </dd>

                <dt>Nhà cung cấp</dt>
                <dd>{booking.payment.provider}</dd>

                <dt>Tham chiếu</dt>
                <dd>
                  {booking.payment.reference ? (
                    <code>{booking.payment.reference}</code>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </dd>

                <dt>Số tiền</dt>
                <dd>
                  <strong>{money(booking.payment.amount)}</strong>
                </dd>

                <dt>Tạo lúc</dt>
                <dd>{formatDateTime(booking.payment.createdAt)}</dd>
              </dl>
            </div>
          )}

          {booking.tickets.length > 0 && (
            <div className="detail-card">
              <div className="detail-card-header">
                <p className="eyebrow">VÉ ({booking.tickets.length})</p>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Mã vé</th>
                      <th>Trạng thái</th>
                      <th>Dùng lúc</th>
                      <th>Tạo lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <code>{ticket.code}</code>
                        </td>
                        <td>
                          <span
                            className={`status ${ticket.status.toLowerCase()}`}
                          >
                            {ticketStatusText[ticket.status] ?? ticket.status}
                          </span>
                        </td>
                        <td>
                          {ticket.usedAt ? (
                            formatDateTime(ticket.usedAt)
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>{formatDateTime(ticket.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <aside className="detail-sidebar">
          <div className="detail-card">
            <div className="detail-card-header">
              <p className="eyebrow">THAO TÁC NHANH</p>
            </div>
            <div className="quick-actions">
              {canRefund && (
                <button
                  className="danger full-width"
                  onClick={handleRefund}
                  disabled={refundMutation.isPending}
                >
                  {refundMutation.isPending
                    ? "Đang xử lý…"
                    : "Hoàn tiền đặt vé"}
                </button>
              )}
              {canCancel && (
                <button
                  className="secondary full-width"
                  onClick={handleCancel}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? "Đang xử lý…" : "Hủy đặt vé"}
                </button>
              )}
              {booking.payment?.reference && (
                <Link
                  to={`/admin/payments`}
                  className="secondary full-width"
                  style={{ textAlign: "center" }}
                >
                  Xem giao dịch SePay
                </Link>
              )}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <p className="eyebrow">THÔNG TIN KHÁCH HÀNG</p>
            </div>
            <dl className="detail-grid small">
              <dt>User ID</dt>
              <dd>
                <code>{booking.userId}</code>
              </dd>
            </dl>
          </div>
        </aside>
      </div>

      {confirm && (
        <ConfirmDialog
          state={confirm}
          loading={cancelMutation.isPending}
          error={
            cancelMutation.error instanceof Error
              ? cancelMutation.error.message
              : cancelMutation.error
                ? "Không thể hủy đặt vé."
                : undefined
          }
          onClose={() => setConfirm(null)}
        />
      )}
      {refundReasonDialog && (
        <ReasonDialog
          state={{
            title: "Hoàn tiền đặt vé",
            message: (
              <>
                Đặt vé <strong>#{booking.id}</strong> —{" "}
                {money(booking.totalAmount)}. Ghế sẽ được giải phóng, vé bị hủy
                và email hoàn tiền sẽ gửi cho khách.
              </>
            ),
            reasonLabel: "Lý do hoàn tiền",
            reasonPlaceholder: "Ví dụ: Khách yêu cầu do thay đổi lịch",
            noteLabel: "Ghi chú admin (tùy chọn)",
            notePlaceholder: "Thông tin bổ sung cho nội bộ",
            onSubmit: (reason, adminNote) =>
              refundMutation.mutateAsync({ reason, adminNote }),
          }}
          loading={refundMutation.isPending}
          error={
            refundMutation.error instanceof Error
              ? refundMutation.error.message
              : refundMutation.error
                ? "Không thể hoàn tiền."
                : undefined
          }
          onClose={() => setRefundReasonDialog(false)}
        />
      )}
    </AdminPage>
  );
}
