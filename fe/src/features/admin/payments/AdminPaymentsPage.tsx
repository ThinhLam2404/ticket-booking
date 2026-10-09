import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui";
import { formatDate, formatTime, money } from "../../../utils/format";
import { AdminPage } from "../shared";

export function AdminPaymentsPage() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [refundConfirm, setRefundConfirm] = useState<{ id: string; bookingId: string; amount: string } | null>(null);
  const queryClient = useQueryClient();
  const txQuery = useQuery({
    queryKey: ["admin-sepay-transactions", filterStatus],
    queryFn: ({ signal }) => api.adminSepayTransactions(filterStatus || undefined, signal),
    refetchInterval: 10000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: "CONFIRMED" | "REVIEW_REQUIRED" | "REFUNDED"; adminNote?: string }) =>
      api.adminUpdateSepayTransaction(id, { status, adminNote }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-sepay-transactions"] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => api.adminConfirmSepayTransaction(id, { force }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-sepay-transactions"] }),
  });

  const refundMutation = useMutation({
    mutationFn: ({ bookingId, reason, adminNote }: { bookingId: string; reason: string; adminNote?: string }) =>
      api.adminRefundBooking(bookingId, { reason, adminNote }),
    onSuccess: () => {
      setRefundConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-sepay-transactions"] });
    },
  });

  const transactions = txQuery.data ?? [];

  const booking = (tx: typeof transactions[0]) => tx.booking;

  return (
    <AdminPage>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">SEPAY TRANSACTIONS</p>
          <h1>Giao dịch chuyển khoản SePay</h1>
        </div>
      </div>
      <div className="filter-tabs">
        <button className={`tab-button ${!filterStatus ? "active" : ""}`} onClick={() => setFilterStatus("")}>Tất cả</button>
        <button className={`tab-button ${filterStatus === "REVIEW_REQUIRED" ? "active" : ""}`} onClick={() => setFilterStatus("REVIEW_REQUIRED")}>Cần xử lý / Hoàn tiền</button>
        <button className={`tab-button ${filterStatus === "CONFIRMED" ? "active" : ""}`} onClick={() => setFilterStatus("CONFIRMED")}>Đã xác nhận</button>
        <button className={`tab-button ${filterStatus === "REFUNDED" ? "active" : ""}`} onClick={() => setFilterStatus("REFUNDED")}>Đã hoàn tiền</button>
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
                <th>Đặt vé liên kết</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const b = booking(tx);
                return (
                  <tr key={tx.id}>
                    <td><strong>#{tx.sepayId}</strong></td>
                    <td>{tx.gateway}</td>
                    <td><strong>{money(tx.transferAmount)}</strong></td>
                    <td><code className="payment-code-pill">{tx.content}</code></td>
                    <td>{formatDate(tx.transactionDate)} {formatTime(tx.transactionDate)}</td>
                    <td>
                      {b ? (
                        <div className="booking-context">
                          <strong>#{b.id}</strong>
                          <small>{b.movieTitle}</small>
                          <small>{b.seatLabels?.join(", ") || "—"}</small>
                          <small>{b.userEmail}</small>
                          <span className={`status ${b.status.toLowerCase()}`}>{b.status}</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td><span className={`status ${tx.status.toLowerCase()}`}>{tx.status}</span></td>
                    <td>
                      {tx.status === "REVIEW_REQUIRED" && (
                        <div className="action-button-group">
                          <button
                            type="button"
                            className="primary btn-sm"
                            disabled={confirmMutation.isPending}
                            onClick={() => {
                              const warn = b ? [] : ["Không tìm thấy đặt vé liên kết"];
                              if (b && b.totalAmount && tx.transferAmount && b.totalAmount !== tx.transferAmount) warn.push("Lệch số tiền");
                              if (b && new Date(b.showtimeStartsAt) < new Date()) warn.push("Suất chiếu đã diễn ra");
                              if (b && b.status !== "PENDING") warn.push(`Đặt vé: ${b.status}`);
                              if (warn.length && !window.confirm(`Cảnh báo: ${warn.join(", ")}.\nVẫn xác nhận?`)) return;
                              confirmMutation.mutate({ id: tx.id, force: warn.length > 0 });
                            }}
                          >
                            Xác nhận giao dịch
                          </button>
                          {b && b.status !== "CANCELLED" && b.status !== "EXPIRED" && (
                            <button
                              type="button"
                              className="secondary btn-sm"
                              disabled={updateMutation.isPending || refundMutation.isPending}
                              onClick={() => setRefundConfirm({ id: tx.id, bookingId: b.id, amount: b.totalAmount })}
                            >
                              Hoàn tiền
                            </button>
                          )}
                        </div>
                      )}
                      {tx.status === "CONFIRMED" && b && b.status === "CONFIRMED" && (
                        <div className="action-button-group">
                          <button
                            type="button"
                            className="secondary btn-sm"
                            disabled={refundMutation.isPending}
                            onClick={() => setRefundConfirm({ id: tx.id, bookingId: b.id, amount: b.totalAmount })}
                          >
                            Hoàn tiền
                          </button>
                        </div>
                      )}
                      {!b && (
                        <a className="secondary compact-button" href={`/admin/bookings/${tx.paymentIntentId}`}>Xem đặt vé</a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {refundConfirm && (
        <div className="modal-overlay" onClick={() => setRefundConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Xác nhận hoàn tiền</h3>
              <button className="modal-close" onClick={() => setRefundConfirm(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>Đặt vé <strong>#{refundConfirm.bookingId}</strong> — {money(refundConfirm.amount)}</p>
              <p className="text-muted">Ghế sẽ được giải phóng, vé bị hủy, email hoàn tiền sẽ gửi cho khách.</p>
              <label>
                Lý do <span className="required">*</span>
                <textarea id="refund-reason" rows={3} placeholder="Ví dụ: Khách yêu cầu do thay đổi lịch" />
              </label>
              <label>
                Ghi chú admin
                <textarea id="refund-admin-note" rows={2} placeholder="Tùy chọn" />
              </label>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setRefundConfirm(null)}>Hủy</button>
              <button
                className="danger"
                disabled={refundMutation.isPending}
                onClick={() => {
                  const reason = (document.getElementById("refund-reason") as HTMLTextAreaElement)?.value?.trim();
                  const adminNote = (document.getElementById("refund-admin-note") as HTMLTextAreaElement)?.value?.trim() || undefined;
                  if (!reason) return alert("Vui lòng nhập lý do");
                  refundMutation.mutate({ bookingId: refundConfirm.bookingId, reason, adminNote });
                }}
              >
                {refundMutation.isPending ? "Đang xử lý…" : "Xác nhận hoàn tiền"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}