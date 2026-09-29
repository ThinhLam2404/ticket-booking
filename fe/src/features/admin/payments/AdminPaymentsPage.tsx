import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui";
import { formatDate, formatTime, money } from "../../../utils/format";
import { AdminPage } from "../shared";

export function AdminPaymentsPage() {
  const [filterStatus, setFilterStatus] = useState<string>("");
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
                    {tx.status === "REVIEW_REQUIRED" && (
                      <div className="action-button-group">
                        <button
                          type="button"
                          className="secondary btn-sm"
                          disabled={updateMutation.isPending}
                          onClick={() => {
                            const note = prompt("Ghi chú xử lý (tùy chọn):") ?? undefined;
                            updateMutation.mutate({ id: tx.id, status: "REFUNDED", adminNote: note });
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
