import { ApiClientError } from '../api';

export function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDay(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value));
}

export function money(value: string | number) {
  return `${Number(value).toLocaleString('vi-VN')} đ`;
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Đang hiệu lực',
  ARCHIVED: 'Đã lưu trữ',
  AVAILABLE: 'Còn trống',
  CANCELLED: 'Đã hủy',
  CONFIRMED: 'Đã xác nhận',
  DRAFT: 'Bản nháp',
  EXPIRED: 'Đã hết hạn',
  FAILED: 'Thất bại',
  HELD: 'Đang giữ',
  PENDING: 'Chờ xử lý',
  PUBLISHED: 'Đang chiếu',
  REFUNDED: 'Đã hoàn tiền',
  SOLD: 'Đã bán',
  SUCCEEDED: 'Thành công',
  USED: 'Đã sử dụng',
};

export function statusLabel(status: string) {
  return statusLabels[status] ?? status;
}

const apiMessages: Record<string, string> = {
  'Booking is no longer available for checkout': 'Booking không còn khả dụng để thanh toán.',
  'Booking is no longer payable': 'Booking không còn có thể thanh toán.',
  'Invalid email or password': 'Sai mật khẩu.',
  'Booking no longer owns all selected seats': 'Booking không còn sở hữu toàn bộ ghế đã chọn.',
  'Booking not found': 'Không tìm thấy booking.',
  'Only pending bookings can be cancelled': 'Chỉ booking đang chờ mới có thể hủy.',
  'One or more seats are being held': 'Một hoặc nhiều ghế vừa được người khác giữ.',
  'Payment idempotency key is required': 'Thiếu mã idempotency của giao dịch.',
  'Ticket not found': 'Không tìm thấy vé.',
};

export function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof ApiClientError) {
    if (cause.path.endsWith('/auth/login')) return apiMessages[cause.message] ?? 'Sai mật khẩu.';
    if (cause.statusCode === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (cause.statusCode === 503) return 'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại.';
    return apiMessages[cause.message] ?? cause.message;
  }
  return cause instanceof Error ? cause.message : fallback;
}
