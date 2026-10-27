import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../api";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui";
import { formatDate, formatTime, money } from "../../../utils/format";
import { AdminPage, ConfirmDialog, ReasonDialog } from "../shared";

export function AdminPaymentsPage() {
  const [params, setParams] = useSearchParams();
  const filterStatus = params.get("status") ?? "";
  const cursor = {
    after: params.get("after") ?? undefined,
    before: params.get("before") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };
  const [refundConfirm, setRefundConfirm] = useState<{ bookingId: string; amount: string } | null>(null);
  const [paymentWarning, setPaymentWarning] = useState<{ id: string; force: boolean; message: string } | null>(null);
  const queryClient = useQueryClient();
  const txQuery = useQuery({
    queryKey: ["admin-sepay-transactions", filterStatus, cursor],
    queryFn: ({ signal }) => api.adminSepayTransactions({ status: filterStatus || undefined, ...cursor }, signal),
    refetchInterval: 10000,
  });

  const resetCursor = (status: string) => setParams((current) => {
    if (status) current.set("status", status);
    else current.delete("status");
    current.delete("after");
    current.delete("before");
    return current;
  });
  const move = (value: string | null, direction: "after" | "before") => {
    if (!value) return;
    setParams((current) => {
      current.set(direction, value);
      current.delete(direction === "after" ? "before" : "after");
      return current;
    });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: "CONFIRMED" | "REVIEW_REQUIRED" | "REFUNDED"; adminNote?: string }) =>
      api.adminUpdateSepayTransaction(id, { status, adminNote }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-sepay-transactions"] }),
  });
  const confirmMutation = useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => api.adminConfirmSepayTransaction(id, { force }),
    onError: (cause, variables) => setPaymentWarning({ id: variables.id, force: Boolean(variables.force), message: `Không thể xác nhận giao dịch: ${cause instanceof Error ? cause.message : "vui lòng thử lại."}` }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-sepay-transactions"] });
      setPaymentWarning(null);
    },
  });
  const refundMutation = useMutation({
    mutationFn: ({ bookingId, reason, adminNote }: { bookingId: string; reason: string; adminNote?: string }) =>
      api.adminRefundBooking(bookingId, { reason, adminNote }),
    onError: () => undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-sepay-transactions"] });
      setRefundConfirm(null);
    },
  });

  const transactions = txQuery.data?.data ?? [];
  const meta = txQuery.data?.meta;
  const booking = (tx: typeof transactions[number]) => tx.booking;

  const askConfirm = (tx: typeof transactions[number]) => {
    if (confirmMutation.isPending || updateMutation.isPending || refundMutation.isPending) return;
    const b = booking(tx);
    const warn = b ? [] : ["Không tìm thấy đặt vé liên kết"];
    if (b && b.totalAmount && tx.transferAmount && b.totalAmount !== tx.transferAmount) warn.push("Lệch số tiền");
    if (b && new Date(b.showtimeStartsAt) < new Date()) warn.push("Suất chiếu đã diễn ra");
    if (b && b.status !== "PENDING") warn.push(`Trạng thái đặt vé: ${b.status === "CONFIRMED" ? "Đã xác nhận" : b.status === "CANCELLED" ? "Đã hủy" : "Đã hết hạn"}`);
    if (!warn.length) {
      void confirmMutation.mutateAsync({ id: tx.id }).catch(() => undefined);
      return;
    }
    setPaymentWarning({ id: tx.id, force: true, message: `Cảnh báo: ${warn.join(", ")}. Vẫn xác nhận giao dịch?` });
  };

  return (
    <AdminPage>
      <div className="admin-page-header"><div><p className="eyebrow">SEPAY TRANSACTIONS</p><h1>Giao dịch chuyển khoản SePay</h1></div></div>
      <div className="filter-tabs">
        <button className={`tab-button ${!filterStatus ? "active" : ""}`} onClick={() => resetCursor("")}>Tất cả</button>
        <button className={`tab-button ${filterStatus === "REVIEW_REQUIRED" ? "active" : ""}`} onClick={() => resetCursor("REVIEW_REQUIRED")}>Cần xử lý / Hoàn tiền</button>
        <button className={`tab-button ${filterStatus === "CONFIRMED" ? "active" : ""}`} onClick={() => resetCursor("CONFIRMED")}>Đã xác nhận</button>
        <button className={`tab-button ${filterStatus === "REFUNDED" ? "active" : ""}`} onClick={() => resetCursor("REFUNDED")}>Đã hoàn tiền</button>
      </div>
      {txQuery.isPending && <LoadingState label="Đang tải giao dịch…" />}
      {txQuery.isError && <ErrorState cause={txQuery.error} fallback="Không thể tải giao dịch." onRetry={() => void txQuery.refetch()} />}
      {txQuery.isSuccess && !transactions.length && <EmptyState>Không có giao dịch nào.</EmptyState>}
      {txQuery.isSuccess && Boolean(transactions.length) && (
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ID SePay</th><th>Cổng</th><th>Số tiền</th><th>Nội dung CK</th><th>Thời gian</th><th>Đặt vé liên kết</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
          {transactions.map((tx) => {
            const b = booking(tx);
            return <tr key={tx.id}><td><strong>#{tx.sepayId}</strong></td><td>{tx.gateway}</td><td><strong>{money(tx.transferAmount)}</strong></td><td><code className="payment-code-pill">{tx.content}</code></td><td>{formatDate(tx.transactionDate)} {formatTime(tx.transactionDate)}</td><td>{b ? <div className="booking-context"><strong>#{b.id}</strong><small>{b.movieTitle}</small><small>{b.seatLabels?.join(", ") || "—"}</small><small>{b.userEmail}</small><span className={`status ${b.status.toLowerCase()}`}>{b.status === "PENDING" ? "Chờ thanh toán" : b.status === "CONFIRMED" ? "Đã xác nhận" : b.status === "CANCELLED" ? "Đã hủy" : "Đã hết hạn"}</span></div> : <span className="text-muted">—</span>}</td><td><span className={`status ${tx.status.toLowerCase()}`}>{tx.status === "REVIEW_REQUIRED" ? "Cần xử lý" : tx.status === "CONFIRMED" ? "Đã xác nhận" : "Đã hoàn tiền"}</span></td><td>
              {tx.status === "REVIEW_REQUIRED" && <div className="action-button-group"><button type="button" className="primary btn-sm" disabled={confirmMutation.isPending} onClick={() => askConfirm(tx)}>Xác nhận giao dịch</button>{b && b.status !== "CANCELLED" && b.status !== "EXPIRED" && <button type="button" className="secondary btn-sm" disabled={updateMutation.isPending || refundMutation.isPending} onClick={() => setRefundConfirm({ bookingId: b.id, amount: b.totalAmount })}>Hoàn tiền</button>}</div>}
              {tx.status === "CONFIRMED" && b && b.status === "CONFIRMED" && <button type="button" className="secondary btn-sm" disabled={refundMutation.isPending} onClick={() => setRefundConfirm({ bookingId: b.id, amount: b.totalAmount })}>Hoàn tiền</button>}
              {!b && <a className="secondary compact-button" href={`/admin/bookings/${tx.paymentIntentId}`}>Xem đặt vé</a>}
            </td></tr>;
          })}
        </tbody></table></div>
      )}
      {meta && <div className="cursor-pagination"><button className="secondary" disabled={!meta.hasPreviousPage || txQuery.isFetching} onClick={() => move(meta.previousCursor, "before")}>← Trước</button><span>{meta.hasNextPage ? "Có thêm giao dịch" : "Cuối danh sách"}</span><button className="secondary" disabled={!meta.hasNextPage || txQuery.isFetching} onClick={() => move(meta.nextCursor, "after")}>Tiếp →</button></div>}
      {paymentWarning && <ConfirmDialog state={{ title: "Xác nhận giao dịch có cảnh báo", message: paymentWarning.message, onConfirm: () => confirmMutation.mutateAsync({ id: paymentWarning.id, force: paymentWarning.force }) }} loading={confirmMutation.isPending} error={confirmMutation.error ? "Không thể xác nhận giao dịch." : undefined} onClose={() => setPaymentWarning(null)} />}
      {refundConfirm && <ReasonDialog state={{ title: "Xác nhận hoàn tiền", message: <>Đặt vé <strong>#{refundConfirm.bookingId}</strong> — {money(refundConfirm.amount)}. Hệ thống sẽ ghi nhận hoàn tiền thủ công, giải phóng ghế, hủy vé và gửi email thông báo cho khách.</>, reasonLabel: "Lý do hoàn tiền", reasonPlaceholder: "Ví dụ: Khách yêu cầu do thay đổi lịch", noteLabel: "Ghi chú admin (tùy chọn)", notePlaceholder: "Thông tin bổ sung cho nội bộ", onSubmit: (reason, adminNote) => refundMutation.mutateAsync({ bookingId: refundConfirm.bookingId, reason, adminNote }) }} loading={refundMutation.isPending} error={refundMutation.error ? "Không thể hoàn tiền." : undefined} onClose={() => setRefundConfirm(null)} />}
    </AdminPage>
  );
}
