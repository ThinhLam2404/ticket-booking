import type {
  ApiError,
  AuthResponse,
  EmailVerificationRequiredResponse,
  EmailVerificationResponse,
  EmailVerificationResendResponse,
  Booking,
  CursorBookingsResponse,
  CursorTicketsResponse,
  CursorSepayTransactionsResponse,
  Cinema,
  HoldRequest,
  LoginRequest,
  SepayCheckoutResponse,
  SepayTransaction,
  UpdateSepayTransactionRequest,
  MovieDetails,
  MoviesResponse,
  RegisterRequest,
  ShowtimeResponse,
  ShowtimeSeatsResponse,
  ShowtimesResponse,
  Ticket,
  User,
  AdminMoviesQuery,
  AdminMoviesResponse,
  TmdbMoviesQuery,
  TmdbMoviesResponse,
  TmdbMovieImportResponse,
  TmdbMovieResyncResponse,
  CreateMovieRequest,
  UpdateMovieRequest,
  MovieMutationResponse,
  MovieUpdateResponse,
  CinemaDetails,
  CreateCinemaRequest,
  UpdateCinemaRequest,
  CinemaMutationResponse,
  CinemaUpdateResponse,
  CinemaDeleteResponse,
  RoomsResponse,
  RoomResponse,
  CreateRoomRequest,
  UpdateRoomRequest,
  RoomMutationResponse,
  RoomUpdateResponse,
  RoomDeleteResponse,
  SeatsResponse,
  CreateSeatRequest,
  UpdateSeatRequest,
  BulkSeatLayoutRequest,
  SeatMutationResponse,
  SeatUpdateResponse,
  SeatDeleteResponse,
  AdminShowtimesQuery,
  AdminShowtimesResponse,
  CreateShowtimeRequest,
  UpdateShowtimeRequest,
  BulkShowtimeRequest,
  BulkShowtimePreviewResponse,
  CinemaBulkShowtimeRequest,
  CinemaBulkPreviewResponse,
  CinemaBulkResponse,
  CinemaFreeSlotsResponse,
  ShowtimePricingQuoteRequest,
  ShowtimePricingQuoteResponse,
  BulkShowtimeResponse,
  ShowtimeMutationResponse,
  ShowtimeUpdateResponse,
  ShowtimeDeleteResponse,
  FreeSlotsResponse,
  ProvincesResponse,
  OperationsStatus,
  AuthSession,
  AdminUser,
  UpdateAdminUserAccessRequest,
  AdminAuditLog,
  AdminUserSession,
  AdminInvitation,
  CreateAdminInvitationRequest,
  AcceptAdminInvitationRequest,
  AdminInvitationPreview,
  AdminInvitationAccepted,
  ChangePasswordRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

const REFRESH_TOKEN_STORAGE_KEY = 'ticket_booking_refresh_token';
const USER_STORAGE_KEY = 'ticket_booking_user';

let accessToken: string | null = null;
let storedUser: User | null = readStoredUser();

function readStoredUser(): User | null {
  try {
    const value = window.localStorage.getItem(USER_STORAGE_KEY);
    return value ? JSON.parse(value) as User : null;
  } catch {
    return null;
  }
}

function readStoredRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAuth(response: AuthResponse) {
  try {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, response.refreshToken);
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
  } catch {
    // Authentication still works for the current tab when storage is unavailable.
  }
}

const authChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cinebook-auth') : null;
authChannel?.addEventListener('message', (event) => {
  if (event.data === 'logout') clearAuth(false);
  if (event.data === 'login') {
    void restoreAuth().catch(() => {
      // A background cross-tab refresh must not create an unhandled rejection.
      // The active tab keeps its current credentials until a later request decides otherwise.
    });
  }
});

export function getAccessToken() {
  return accessToken;
}

export function setAuth(response: Pick<AuthResponse, 'user' | 'accessToken'> & Partial<Pick<AuthResponse, 'refreshToken'>>) {

  accessToken = response.accessToken;
  storedUser = response.user;
  if (response.refreshToken) writeStoredAuth(response as AuthResponse);
  else {
    try { window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user)); } catch { /* Ignore unavailable storage. */ }
  }
  window.dispatchEvent(new Event('ticket-booking-auth'));
}

export function clearAuth(broadcast = true) {
  accessToken = null;
  storedUser = null;
  try {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage while clearing in-memory credentials.
  }
  window.dispatchEvent(new Event('ticket-booking-auth'));
  if (broadcast) authChannel?.postMessage('logout');
}

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ApiError['details'];
  readonly path: string;
  readonly requestId: string;
  readonly timestamp: string;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.statusCode = error.statusCode;
    this.code = error.code;
    this.details = error.details;
    this.path = error.path;
    this.requestId = error.requestId;
    this.timestamp = error.timestamp;
  }
}

export function getStoredUser(): User | null {
  return storedUser;
}

let refreshPromise: Promise<boolean> | null = null;

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

  const publicAuthPath = path.startsWith('/auth/');
  if (response.status === 401 && retry && !publicAuthPath && getAccessToken()) {
    const refreshed = await refreshToken();
    if (refreshed) return request<T>(path, init, false);
  }

  const error = (await response.json().catch(() => ({
    statusCode: response.status,
    code: 'HTTP_ERROR',
    message: response.statusText || 'Request failed',
    details: [],
    path,
    requestId: '',
    timestamp: new Date().toISOString(),
  }))) as ApiError;
  throw new ApiClientError({
    ...error,
    statusCode: error.statusCode ?? response.status,
    code: error.code ?? 'HTTP_ERROR',
    message: error.message ?? (response.statusText || 'Request failed'),
    details: error.details ?? [],
    path: error.path ?? path,
    requestId: error.requestId ?? '',
    timestamp: error.timestamp ?? new Date().toISOString(),
  });
}

async function refreshToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefreshToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function performRefreshToken() {
  const perform = async () => {
    // Read after acquiring the lock: another tab may have rotated the token
    // while this tab was waiting.
    const refreshToken = readStoredRefreshToken();
    if (!refreshToken) return false;
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clearAuth(false);
      return false;
    }
    setAuth((await response.json()) as AuthResponse);
    return true;
  };
  if (!navigator.locks) return perform();
  return navigator.locks.request('cinebook-refresh', perform);
}

export async function restoreAuth() {
  return refreshToken();
}

export const api = {
  requestPasswordReset(body: RequestPasswordResetRequest) {
    return request<{ sent: true }>('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  resetPassword(body: ResetPasswordRequest) {
    return request<{ reset: true }>('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  changePassword(body: ChangePasswordRequest) {
    return request<{ changed: true }>('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  sessions() {
    return request<AuthSession[]>('/auth/sessions');
  },
  revokeSession(sessionId: string) {
    return request<void>(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  },
  revokeOtherSessions() {
    return request<void>('/auth/sessions/revoke-others', { method: 'POST', body: '{}' });
  },
  revokeAllSessions() {
    return request<void>('/auth/sessions/revoke-all', { method: 'POST', body: '{}' });
  },
  adminUsers(filters: { search?: string; status?: 'ACTIVE' | 'DISABLED' } = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    return request<AdminUser[]>(`/users/admin${params.size ? `?${params.toString()}` : ''}`);
  },
  updateAdminUserAccess(id: string, body: UpdateAdminUserAccessRequest) {
    return request<AdminUser>(`/users/admin/${encodeURIComponent(id)}/access`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  adminUserSessions(id: string) {
    return request<AdminUserSession[]>(`/users/admin/${encodeURIComponent(id)}/sessions`);
  },
  revokeAdminUserSession(id: string, sessionId: string) {
    return request<void>(`/users/admin/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  },
  revokeAdminUserSessions(id: string) {
    return request<void>(`/users/admin/${encodeURIComponent(id)}/sessions/revoke-all`, { method: 'POST', body: '{}' });
  },
  adminInvitations(search?: string) {
    const params = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return request<AdminInvitation[]>(`/users/admin/invitations${params}`);
  },
  createAdminInvitation(body: CreateAdminInvitationRequest) {
    return request<AdminInvitation>('/users/admin/invitations', { method: 'POST', body: JSON.stringify(body) });
  },
  resendAdminInvitation(id: string) {
    return request<AdminInvitation>(`/users/admin/invitations/${encodeURIComponent(id)}/resend`, { method: 'POST', body: '{}' });
  },
  revokeAdminInvitation(id: string) {
    return request<AdminInvitation>(`/users/admin/invitations/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' });
  },
  previewAdminInvitation(body: { token: string }) {
    return request<AdminInvitationPreview>('/auth/admin-invitations/preview', { method: 'POST', body: JSON.stringify(body) });
  },
  acceptAdminInvitation(body: AcceptAdminInvitationRequest) {
    return request<AdminInvitationAccepted>('/auth/admin-invitations/accept', { method: 'POST', body: JSON.stringify(body) });
  },
  auditLogs(filters: { limit?: number; search?: string; action?: string; resourceType?: string; actorUserId?: string; from?: string; to?: string } = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
    return request<AdminAuditLog[]>(`/admin/audit-logs${params.size ? `?${params.toString()}` : ''}`);
  },
  async register(body: RegisterRequest) {
    return request<EmailVerificationRequiredResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  verifyEmail(token: string) {
    return request<EmailVerificationResponse>('/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },
  resendVerificationEmail(email: string) {
    return request<EmailVerificationResendResponse>('/auth/email/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  async login(body: LoginRequest) {
    const perform = () => request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const response = navigator.locks ? await navigator.locks.request('cinebook-refresh', perform) : await perform();
    setAuth(response);
    authChannel?.postMessage('login');
    return response;
  },
  async logout() {
    try {
      const perform = () => {
        const refreshToken = readStoredRefreshToken();
        if (!refreshToken) return Promise.resolve();
        return request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        }, false);
      };
      if (navigator.locks) await navigator.locks.request('cinebook-refresh', perform);
      else await perform();
    } finally {
      // Local credentials must be cleared even when the network is unavailable.
      clearAuth();
    }
  },
  provinces(signal?: AbortSignal) {
    return request<ProvincesResponse>('/locations/provinces', { signal });
  },
  movies(search = '', provinceCode?: number, category?: 'NOW_SHOWING' | 'COMING_SOON' | 'SPECIAL', signal?: AbortSignal) {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (search) params.set('search', search);
    if (provinceCode) params.set('provinceCode', String(provinceCode));
    if (category) params.set('category', category);
    return request<MoviesResponse>(`/movies?${params.toString()}`, { signal });
  },
  adminMovies(filters: AdminMoviesQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return request<AdminMoviesResponse>(`/movies/admin?${params.toString()}`, { signal });
  },
  tmdbMovies(query: TmdbMoviesQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(query.page ?? 1) });
    if (query.search) params.set('search', query.search);
    return request<TmdbMoviesResponse>(`/movies/admin/tmdb?${params.toString()}`, { signal });
  },
  importTmdbMovie(tmdbId: number) {
    return request<TmdbMovieImportResponse>(`/movies/admin/tmdb/${tmdbId}/import`, { method: 'PUT' });
  },
  resyncTmdbMovie(tmdbId: number) {
    return request<TmdbMovieResyncResponse>(`/movies/admin/tmdb/${tmdbId}/resync`, { method: 'PUT' });
  },
  createMovie(body: CreateMovieRequest) {
    return request<MovieMutationResponse>('/movies', { method: 'POST', body: JSON.stringify(body) });
  },
  updateMovie(id: string, body: UpdateMovieRequest) {
    return request<MovieUpdateResponse>(`/movies/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  archiveMovie(id: string) {
    return request<MovieUpdateResponse>(`/movies/${id}`, { method: 'DELETE' });
  },
  movie(id: string, provinceCode?: number, signal?: AbortSignal) {
    const params = provinceCode ? `?provinceCode=${provinceCode}` : '';
    return request<MovieDetails>(`/movies/${id}${params}`, { signal });
  },
  showtimes(filters: { movieId?: string; cinemaId?: string; provinceCode?: number; format?: string; roomFormat?: string; specialOnly?: boolean; from?: string; to?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(filters.page ?? 1), pageSize: String(filters.pageSize ?? 100) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, String(value));
    }
    return request<ShowtimesResponse>(`/showtimes?${params.toString()}`, { signal });
  },
  cinemas(provinceCode?: number, signal?: AbortSignal) {
    const params = provinceCode ? `?provinceCode=${provinceCode}` : '';
    return request<Cinema[]>(`/cinemas${params}`, { signal });
  },
  cinema(id: string, signal?: AbortSignal) {
    return request<CinemaDetails>(`/cinemas/${id}`, { signal });
  },
  createCinema(body: CreateCinemaRequest) {
    return request<CinemaMutationResponse>('/cinemas', { method: 'POST', body: JSON.stringify(body) });
  },
  updateCinema(id: string, body: UpdateCinemaRequest) {
    return request<CinemaUpdateResponse>(`/cinemas/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  deleteCinema(id: string) {
    return request<CinemaDeleteResponse>(`/cinemas/${id}`, { method: 'DELETE' });
  },
  rooms(cinemaId: string, signal?: AbortSignal) {
    return request<RoomsResponse>(`/rooms?cinemaId=${encodeURIComponent(cinemaId)}`, { signal });
  },
  room(id: string, signal?: AbortSignal) {
    return request<RoomResponse>(`/rooms/${id}`, { signal });
  },
  createRoom(body: CreateRoomRequest) {
    return request<RoomMutationResponse>('/rooms', { method: 'POST', body: JSON.stringify(body) });
  },
  updateRoom(id: string, body: UpdateRoomRequest) {
    return request<RoomUpdateResponse>(`/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  deleteRoom(id: string) {
    return request<RoomDeleteResponse>(`/rooms/${id}`, { method: 'DELETE' });
  },
  seats(roomId: string, signal?: AbortSignal) {
    return request<SeatsResponse>(`/seats/room/${roomId}`, { signal });
  },
  createSeat(roomId: string, body: CreateSeatRequest) {
    return request<SeatMutationResponse>(`/seats/${roomId}`, { method: 'POST', body: JSON.stringify(body) });
  },
  updateSeat(id: string, body: UpdateSeatRequest) {
    return request<SeatUpdateResponse>(`/seats/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  deleteSeat(id: string) {
    return request<SeatDeleteResponse>(`/seats/${id}`, { method: 'DELETE' });
  },
  replaceSeatLayout(roomId: string, body: BulkSeatLayoutRequest) {
    return request<SeatsResponse>(`/seats/room/${roomId}/layout`, { method: 'PUT', body: JSON.stringify(body) });
  },
  adminShowtimes(filters: AdminShowtimesQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return request<AdminShowtimesResponse>(`/showtimes/admin?${params.toString()}`, { signal });
  },
  adminShowtime(id: string, signal?: AbortSignal) {
    return request<ShowtimeResponse>(`/showtimes/${id}`, { signal });
  },
  createShowtime(body: CreateShowtimeRequest) {
    return request<ShowtimeMutationResponse>('/showtimes', { method: 'POST', body: JSON.stringify(body) });
  },
  updateShowtime(id: string, body: UpdateShowtimeRequest) {
    return request<ShowtimeUpdateResponse>(`/showtimes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  quoteShowtimePricing(body: ShowtimePricingQuoteRequest) {
    return request<ShowtimePricingQuoteResponse>('/showtimes/pricing/quote', { method: 'POST', body: JSON.stringify(body) });
  },
  previewBulkShowtimes(body: BulkShowtimeRequest) {
    return request<BulkShowtimePreviewResponse>('/showtimes/bulk/preview', { method: 'POST', body: JSON.stringify(body) });
  },
  createBulkShowtimes(body: BulkShowtimeRequest) {
    return request<BulkShowtimeResponse>('/showtimes/bulk', { method: 'POST', body: JSON.stringify(body) });
  },
  previewCinemaBulkShowtimes(body: CinemaBulkShowtimeRequest) {
    return request<CinemaBulkPreviewResponse>('/showtimes/cinema-bulk/preview', { method: 'POST', body: JSON.stringify(body) });
  },
  createCinemaBulkShowtimes(body: CinemaBulkShowtimeRequest) {
    return request<CinemaBulkResponse>('/showtimes/cinema-bulk', { method: 'POST', body: JSON.stringify(body) });
  },
  cinemaFreeSlots(cinemaId: string, query: { date: string; durationMinutes: number; turnaroundMinutes: number }, signal?: AbortSignal) {
    const params = new URLSearchParams({ date: query.date, durationMinutes: String(query.durationMinutes), turnaroundMinutes: String(query.turnaroundMinutes) });
    return request<CinemaFreeSlotsResponse>(`/showtimes/cinemas/${cinemaId}/free-slots?${params.toString()}`, { signal });
  },
  deleteShowtime(id: string) {
    return request<ShowtimeDeleteResponse>(`/showtimes/${id}`, { method: 'DELETE' });
  },
  roomFreeSlots(roomId: string, query: { date: string; durationMinutes: number; turnaroundMinutes: number }, signal?: AbortSignal) {
    const params = new URLSearchParams({
      date: query.date,
      durationMinutes: String(query.durationMinutes),
      turnaroundMinutes: String(query.turnaroundMinutes),
    });
    return request<FreeSlotsResponse>(`/showtimes/rooms/${roomId}/free-slots?${params.toString()}`, { signal });
  },
  showtime(id: string, signal?: AbortSignal) {
    return request<ShowtimeResponse>(`/showtimes/${id}`, { signal });
  },
  showtimeSeats(id: string, signal?: AbortSignal) {
    return request<ShowtimeSeatsResponse>(`/showtimes/${id}/seats`, { signal });
  },
  comboMenu(cinemaId: string) { return request<import('./generated/openapi').components['schemas']['CinemaComboResponseDto'][]>(`/combos/cinemas/${cinemaId}`); },
  adminCombos() { return request<import('./generated/openapi').components['schemas']['ComboResponseDto'][]>('/combos/admin'); },
  saveCombo(id: string | null, body: import('./generated/openapi').components['schemas']['CreateComboDto']) { return request(`/combos/admin${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) }); },
  adminComboMenu(cinemaId: string) { return request<import('./generated/openapi').components['schemas']['CinemaComboResponseDto'][]>(`/combos/admin/cinemas/${cinemaId}`); },
  saveComboOffer(cinemaId: string, comboId: string, body: { price: number; active: boolean }) { return request(`/combos/admin/cinemas/${cinemaId}/${comboId}`, { method: 'PUT', body: JSON.stringify(body) }); },
  hold(showtimeId: string, showtimeSeatIds: string[], idempotencyKey = `hold-${crypto.randomUUID()}`, combos: NonNullable<HoldRequest['combos']> = []) {
    const body: HoldRequest = { showtimeId, showtimeSeatIds, combos };
    return request<Booking>('/bookings/hold', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
  },
  booking(id: string, signal?: AbortSignal) {
    return request<Booking>(`/bookings/${id}`, { signal });
  },
  checkout(bookingId: string) {
    return request<SepayCheckoutResponse>(`/payments/bookings/${bookingId}/checkout`, { method: 'POST' });
  },
  bookings(params: { status?: string; search?: string; after?: string; before?: string; limit?: number; from?: string; to?: string } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, String(value)); });
    return request<CursorBookingsResponse>(`/bookings?${query.toString()}`, { signal });
  },
  adminBookings(params: { search?: string; status?: string; after?: string; before?: string; limit?: number; from?: string; to?: string } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
    return request<CursorBookingsResponse>(`/bookings/admin?${query}`, { signal });
  },
  adminBooking(id: string, signal?: AbortSignal) {
    return request<Booking>(`/bookings/admin/${id}`, { signal });
  },
  cancelBooking(id: string) {
    return request<Booking>(`/bookings/${id}/cancel`, { method: 'POST' });
  },
  ticket(id: string, signal?: AbortSignal) {
    return request<Ticket>(`/tickets/${id}`, { signal });
  },
  tickets(params: { status?: string; search?: string; after?: string; before?: string; limit?: number; from?: string; to?: string } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
    return request<CursorTicketsResponse>(`/tickets?${query}`, { signal });
  },
  adminSepayTransactions(params: { status?: string; after?: string; before?: string; limit?: number; from?: string; to?: string } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
    return request<CursorSepayTransactionsResponse>(`/payments/admin/sepay/transactions?${query.toString()}`, { signal });
  },
  adminConfirmSepayTransaction(id: string, body: { force?: boolean; adminNote?: string }) {
    return request<SepayTransaction>(`/payments/admin/sepay/transactions/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  adminUpdateSepayTransaction(id: string, body: UpdateSepayTransactionRequest) {
    return request<SepayTransaction>(`/payments/admin/sepay/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  adminRefundBooking(bookingId: string, body: { reason: string; adminNote?: string }) {
    return request(`/payments/admin/bookings/${bookingId}/refund`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  adminOperationsStatus(signal?: AbortSignal) {
    return request<OperationsStatus>('/admin/operations/status', { signal });
  },
};

export function cancelBookingKeepalive(id: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  void fetch(`${API_URL}/bookings/${id}/cancel`, {
    method: 'POST',
    headers,
    keepalive: true,
  }).catch(() => undefined);
}
