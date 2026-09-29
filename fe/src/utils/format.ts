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

export function formatReleaseDate(value?: string | null) {
  if (!value) return 'Chưa cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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
  AUTH_EMAIL_NOT_VERIFIED: 'Vui lòng xác thực email trước khi đăng nhập.',
  AUTH_EMAIL_TOKEN_INVALID: 'Liên kết xác thực email không hợp lệ hoặc đã hết hạn.',
  AUTH_INVALID_CREDENTIALS: 'Sai mật khẩu hoặc thông tin đăng nhập.',
  AUTH_ACCESS_TOKEN_INVALID: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  AUTH_REFRESH_TOKEN_INVALID: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  AUTH_TOKEN_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  AUTH_EMAIL_EXISTS: 'Email này đã được đăng ký.',
  USER_NOT_FOUND: 'Không tìm thấy người dùng.',
  BOOKING_CONFIRM_FAILED: 'Không thể xác nhận booking.',
  BOOKING_NOT_CANCELLABLE: 'Booking này không còn có thể hủy.',
  BOOKING_NOT_FOUND: 'Không tìm thấy booking.',
  BOOKING_NOT_PAYABLE: 'Booking không còn có thể thanh toán.',
  BOOKING_SEATS_NOT_OWNED: 'Booking không còn sở hữu toàn bộ ghế đã chọn.',
  COUPLE_LAYOUT_REQUIRED: 'Ghế đôi phải được quản lý theo layout hoàn chỉnh.',
  COUPLE_PARTNER_INVALID: 'Ghế đôi không còn đủ cặp hợp lệ.',
  CINEMA_ALREADY_EXISTS: 'Cụm rạp đã tồn tại.',
  CINEMA_HAS_SHOWTIMES: 'Không thể xóa cụm rạp đang có suất chiếu.',
  CINEMA_NOT_FOUND: 'Không tìm thấy cụm rạp.',
  CONFLICT: 'Dữ liệu đang có xung đột. Vui lòng kiểm tra lại.',
  DATABASE_CONFLICT: 'Dữ liệu đã tồn tại hoặc đang được sử dụng.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  MOVIE_IMPORT_CONFLICT: 'Phim vừa được nhập bởi một thao tác khác.',
  MOVIE_NOT_FOUND: 'Không tìm thấy phim.',
  MOVIE_NOT_PUBLISHED: 'Chỉ phim đã phát hành mới có thể tạo suất chiếu.',
  RESOURCE_NOT_FOUND: 'Không tìm thấy dữ liệu yêu cầu.',
  ROOM_ALREADY_EXISTS: 'Phòng chiếu đã tồn tại trong cụm rạp.',
  ROOM_HAS_SHOWTIMES: 'Không thể xóa phòng đang có suất chiếu.',
  ROOM_FORMAT_HAS_SHOWTIMES: 'Không thể thay đổi định dạng phòng đã có suất chiếu.',
  ROOM_LAYOUT_INVALID: 'Sơ đồ ghế của phòng chưa hợp lệ.',
  ROOM_NO_SEATS: 'Phòng chiếu chưa có ghế.',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng chiếu.',
  SEAT_DUPLICATE_COORDINATE: 'Sơ đồ có vị trí ghế bị trùng.',
  SEAT_LAYOUT_BULK_ONLY: 'Layout hoàn chỉnh chỉ được thay đổi bằng bulk layout.',
  SEAT_LAYOUT_HAS_SHOWTIMES: 'Không thể thay layout khi phòng đã có suất chiếu.',
  SEAT_HAS_SHOWTIMES: 'Không thể thay đổi ghế khi phòng đã có suất chiếu.',
  SEAT_LIMIT_EXCEEDED: 'Bạn chỉ có thể chọn tối đa 10 ghế vật lý.',
  SEAT_NOT_FOUND: 'Không tìm thấy ghế.',
  SEAT_REQUIRED: 'Vui lòng chọn ít nhất một ghế.',
  SEATS_HELD: 'Một hoặc nhiều ghế vừa được người khác giữ.',
  SEATS_SALE_FAILED: 'Không thể cập nhật trạng thái ghế để phát hành vé.',
  SEATS_UNAVAILABLE: 'Một hoặc nhiều ghế không còn trống.',
  SHOWTIME_HAS_BOOKINGS: 'Không thể thay đổi suất chiếu đã có booking.',
  SHOWTIME_IN_PAST: 'Suất chiếu phải bắt đầu trong tương lai.',
  SHOWTIME_TIMEZONE_REQUIRED: 'Giờ bắt đầu phải kèm múi giờ Việt Nam.',
  SHOWTIME_START_INVALID: 'Giờ bắt đầu không hợp lệ.',
  SHOWTIME_INVALID_ORDER: 'Giờ kết thúc phải sau giờ bắt đầu.',
  SHOWTIME_NOT_FOUND: 'Không tìm thấy suất chiếu.',
  SHOWTIME_OVERLAP: 'Phòng đã có suất chiếu trùng thời gian.',
  SHOWTIME_BULK_SHORTAGE: 'Số suất trống trong rạp không đủ số lượng đã yêu cầu.',
  SHOWTIME_OUTSIDE_HOURS: 'Suất chiếu chỉ được bắt đầu từ 08:00 đến 23:00 hằng ngày (giờ Việt Nam).',
  SHOWTIME_STARTED: 'Suất chiếu đã bắt đầu.',
  TICKET_NOT_FOUND: 'Không tìm thấy vé.',
  TMDB_MOVIE_NOT_FOUND: 'Không tìm thấy phim trên TMDB.',
  TMDB_NOT_CONFIGURED: 'TMDB chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
  TMDB_RATE_LIMITED: 'TMDB đang giới hạn lượt truy cập. Vui lòng thử lại sau.',
  VALIDATION_FAILED: 'Dữ liệu nhập chưa hợp lệ. Vui lòng kiểm tra lại.',
  SERVICE_UNAVAILABLE: 'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại.',
};

const legacyApiMessages: Record<string, string> = {
  'Booking is no longer available for checkout': 'Booking không còn khả dụng để thanh toán.',
  'Booking is no longer payable': 'Booking không còn có thể thanh toán.',
  'Invalid email or password': 'Sai mật khẩu hoặc thông tin đăng nhập.',
  'Booking no longer owns all selected seats': 'Booking không còn sở hữu toàn bộ ghế đã chọn.',
  'Booking not found': 'Không tìm thấy booking.',
  'Seat purchase is only available within the final purchase window': 'Chỉ có thể mua ghế trực tiếp trong khoảng thời gian cuối trước suất chiếu.',
  'Only pending bookings can be cancelled': 'Booking này không còn có thể hủy.',
  'One or more seats are being held': 'Một hoặc nhiều ghế vừa được người khác giữ.',
  'Ticket not found': 'Không tìm thấy vé.',
};

export function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof ApiClientError) {
    if (cause.path.endsWith('/auth/login') && cause.code === 'AUTH_INVALID_CREDENTIALS') return apiMessages.AUTH_INVALID_CREDENTIALS;
    if (cause.code === 'SHOWTIME_BULK_SHORTAGE') return cause.message;
    return apiMessages[cause.code] ?? (cause.statusCode === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' : undefined) ?? legacyApiMessages[cause.message] ?? fallback;
  }
  return fallback;
}
