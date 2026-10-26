import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { ErrorState, LoadingState } from '../../components/ui';
import { ComboSummary } from '../booking/ComboSummary';

export function TicketCombos({ bookingId }: { bookingId: string }) {
  const booking = useQuery({ queryKey: ['booking', bookingId], queryFn: ({ signal }) => api.booking(bookingId, signal) });
  if (booking.isPending) return <LoadingState label="Đang tải combo của booking…" />;
  if (booking.isError) return <ErrorState cause={booking.error} fallback="Không tải được combo của booking." onRetry={() => void booking.refetch()} />;
  if (!booking.data.comboItems?.length) return null;
  return <div><p>Combo dưới đây thuộc toàn bộ booking #{bookingId.slice(-8)}, không phải combo riêng cho mỗi vé. Xuất trình thông tin booking tại quầy.</p><ComboSummary booking={booking.data} /></div>;
}
