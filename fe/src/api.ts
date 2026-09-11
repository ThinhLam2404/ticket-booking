import type {
  ApiError,
  AuthResponse,
  Booking,
  Cinema,
  Movie,
  Paginated,
  Payment,
  Showtime,
  ShowtimeSeat,
  Ticket,
  User,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

const ACCESS_TOKEN_KEY = 'ticket_booking_access_token';
const REFRESH_TOKEN_KEY = 'ticket_booking_refresh_token';

export function getAccessToken() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAuth(response: AuthResponse) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
  sessionStorage.setItem('ticket_booking_user', JSON.stringify(response.user));
}

export function clearAuth() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem('ticket_booking_user');
}

export function getStoredUser(): User | null {
  const value = sessionStorage.getItem('ticket_booking_user');
  return value ? (JSON.parse(value) as User) : null;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  if (response.status === 401 && retry && sessionStorage.getItem(REFRESH_TOKEN_KEY)) {
    const refreshed = await refreshToken();
    if (refreshed) return request<T>(path, init, false);
  }

  const error = (await response.json().catch(() => ({
    statusCode: response.status,
    message: response.statusText,
  }))) as ApiError;
  throw new Error(Array.isArray(error.message) ? error.message.join(', ') : error.message);
}

async function refreshToken() {
  const token = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (!token) return false;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  });
  if (!response.ok) {
    clearAuth();
    return false;
  }
  setAuth((await response.json()) as AuthResponse);
  return true;
}

export const api = {
  async register(body: { fullName: string; email: string; password: string }) {
    const response = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setAuth(response);
    return response;
  },
  async login(body: { email: string; password: string }) {
    const response = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setAuth(response);
    return response;
  },
  async logout() {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }, false).catch(() => undefined);
    }
    clearAuth();
  },
  movies(search = '') {
    return request<Paginated<Movie>>(`/movies?page=1&pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  },
  movie(id: string) {
    return request<Movie & { showtimes: Showtime[] }>(`/movies/${id}`);
  },
  showtimes(movieId?: string) {
    return request<Paginated<Showtime>>(`/showtimes?page=1&pageSize=100${movieId ? `&movieId=${movieId}` : ''}`);
  },
  cinemas() {
    return request<Cinema[]>('/cinemas');
  },
  showtimeSeats(id: string) {
    return request<{ showtimeId: string; startsAt: string; endsAt: string; seats: ShowtimeSeat[] }>(`/showtimes/${id}/seats`);
  },
  hold(showtimeId: string, showtimeSeatIds: string[]) {
    return request<Booking>('/bookings/hold', {
      method: 'POST',
      headers: { 'Idempotency-Key': `hold-${crypto.randomUUID()}` },
      body: JSON.stringify({ showtimeId, showtimeSeatIds }),
    });
  },
  checkout(bookingId: string) {
    return request<Payment>(`/bookings/${bookingId}/checkout`, { method: 'POST' });
  },
  mockPayment(bookingId: string, success: boolean) {
    return request<{ payment: Payment; booking: Booking }>(`/payments/mock/${bookingId}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `payment-${crypto.randomUUID()}` },
      body: JSON.stringify({ success }),
    });
  },
  bookings() {
    return request<Booking[]>('/bookings');
  },
  cancelBooking(id: string) {
    return request<Booking>(`/bookings/${id}/cancel`, { method: 'POST' });
  },
  tickets() {
    return request<Ticket[]>('/tickets');
  },
};
