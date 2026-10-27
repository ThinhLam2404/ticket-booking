import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { errorMessage, money } from '../../../utils/format';
import { AdminPage, ConfirmDialog } from '../shared';

const emptyDraft = {
  id: '', code: '', discountType: 'PERCENT' as const, scope: 'ORDER' as const,
  value: '', minimumSpend: '', maximumDiscount: '', startsAt: '', endsAt: '', active: true,
  usageLimit: '1', cinemaIds: [] as string[],
};
type VoucherDraft = Omit<typeof emptyDraft, 'discountType' | 'scope'> & { discountType: 'FIXED' | 'PERCENT'; scope: 'TICKETS' | 'COMBOS' | 'ORDER' };

export function AdminVouchersPage() {
  const client = useQueryClient();
  const vouchers = useQuery({ queryKey: ['admin-vouchers'], queryFn: api.adminVouchers });
  const cinemas = useQuery({ queryKey: ['cinemas'], queryFn: () => api.cinemas() });
  const [draft, setDraft] = useState<VoucherDraft>(emptyDraft);
  const [confirm, setConfirm] = useState(false);
  const [assignConfirm, setAssignConfirm] = useState<{ id: string; code: string; usageLimit: number } | null>(null);
  const assign = useMutation({
    mutationFn: () => api.assignVoucher(assignConfirm!.id, { usageLimit: assignConfirm!.usageLimit }),
    onSuccess: () => { setAssignConfirm(null); void client.invalidateQueries({ queryKey: ['admin-vouchers'] }); },
  });
  const save = useMutation({
    mutationFn: () => api.saveVoucher(draft.id || null, {
      code: draft.code.trim(), discountType: draft.discountType, scope: draft.scope,
      value: Number(draft.value), minimumSpend: Number(draft.minimumSpend || 0),
      maximumDiscount: draft.maximumDiscount ? Number(draft.maximumDiscount) : null,
      startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString(),
      active: draft.active, usageLimit: Number(draft.usageLimit || 1), cinemaIds: draft.cinemaIds,
    }),
    onSuccess: () => { setConfirm(false); setDraft(emptyDraft); void client.invalidateQueries({ queryKey: ['admin-vouchers'] }); },
  });
  if (vouchers.isPending || cinemas.isPending) return <LoadingState label="Đang tải voucher…" />;
  if (vouchers.isError || cinemas.isError) return <ErrorState cause={vouchers.error ?? cinemas.error} fallback="Không tải được voucher." onRetry={() => { void vouchers.refetch(); void cinemas.refetch(); }} />;

  return <AdminPage>
    <div className="admin-page-header"><div><p className="eyebrow">KHUYẾN MÃI</p><h1>Quản lý voucher</h1><p>Phát voucher theo chiến dịch cho từng khách hàng; mỗi người có số lượt riêng và voucher hết hạn theo thời gian chiến dịch.</p></div></div>
    <div className="combo-admin-grid">
      <section className="combo-panel"><h2>Danh sách voucher</h2>
        {!vouchers.data?.length && <EmptyState>Chưa có voucher.</EmptyState>}
        {vouchers.data?.map((voucher) => <div className="combo-row" key={voucher.id}><div><strong>{voucher.code}</strong><p>{voucher.discountType === 'PERCENT' ? `${voucher.value}%` : money(voucher.value)} · {voucher.scope}</p><small>{voucher.active ? 'Đang hoạt động' : 'Đã tắt'} · {voucher.cinemaIds.length ? 'Giới hạn theo rạp' : 'Toàn hệ thống'}</small></div><div className="form-actions"><button className="secondary" onClick={() => setDraft({ ...emptyDraft, ...voucher, value: String(voucher.value), minimumSpend: String(voucher.minimumSpend), maximumDiscount: voucher.maximumDiscount ? String(voucher.maximumDiscount) : '', startsAt: voucher.startsAt.slice(0, 16), endsAt: voucher.endsAt.slice(0, 16), usageLimit: String(voucher.usageLimit ?? 1) })}>Chỉnh sửa</button><button className="secondary" type="button" onClick={() => setAssignConfirm({ id: voucher.id, code: voucher.code, usageLimit: voucher.usageLimit ?? 1 })}>Phát cho mọi khách</button></div></div>)}
      </section>
      <form className="combo-panel admin-form" onSubmit={(event) => { event.preventDefault(); setConfirm(true); }}>
        <h2>{draft.id ? 'Chỉnh sửa voucher' : 'Tạo voucher'}</h2>
        <label>Mã voucher<input required value={draft.code} disabled={Boolean(draft.id)} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} /></label>
        <label>Loại giảm<select value={draft.discountType} onChange={(e) => setDraft({ ...draft, discountType: e.target.value as typeof draft.discountType })}><option value="PERCENT">Phần trăm</option><option value="FIXED">Số tiền</option></select></label>
        <label>Phạm vi<select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as typeof draft.scope })}><option value="ORDER">Toàn đơn</option><option value="TICKETS">Tiền vé</option><option value="COMBOS">Tiền combo</option></select></label>
        <label>Giá trị<input required type="number" min="1" step="0.01" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} /></label>
        <label>Đơn tối thiểu<input type="number" min="0" step="0.01" value={draft.minimumSpend} onChange={(e) => setDraft({ ...draft, minimumSpend: e.target.value })} /></label>
        <label>Giảm tối đa<input type="number" min="0" step="0.01" value={draft.maximumDiscount} onChange={(e) => setDraft({ ...draft, maximumDiscount: e.target.value })} /></label>
        <label>Bắt đầu<input required type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} /></label>
        <label>Kết thúc<input required type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} /></label>
        <label>Số lượt mỗi người<input type="number" min="1" max="10" value={draft.usageLimit} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })} /></label>
        <label>Rạp áp dụng<select multiple value={draft.cinemaIds} onChange={(e) => setDraft({ ...draft, cinemaIds: Array.from(e.target.selectedOptions, (option) => option.value) })}>{cinemas.data?.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select></label>
        <label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Đang hoạt động</label>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setDraft(emptyDraft)}>Tạo mới</button><button className="primary" disabled={save.isPending}>Xem lại thay đổi</button></div>
      </form>
    </div>
    {confirm && <ConfirmDialog state={{ title: 'Lưu voucher?', message: `${draft.code} · ${draft.discountType === 'PERCENT' ? `${draft.value}%` : money(draft.value)}`, onConfirm: () => save.mutate() }} loading={save.isPending} error={save.isError ? errorMessage(save.error, 'Không thể lưu voucher.') : ''} onClose={() => setConfirm(false)} />}
    {assignConfirm && <ConfirmDialog state={{ title: 'Phát voucher cho mọi khách hàng?', message: `${assignConfirm.code} · mỗi khách được ${assignConfirm.usageLimit} lượt. Khách đã được phát sẽ được bỏ qua.`, onConfirm: () => assign.mutate() }} loading={assign.isPending} error={assign.isError ? errorMessage(assign.error, 'Không thể phát voucher.') : ''} onClose={() => setAssignConfirm(null)} />}
  </AdminPage>;
}
