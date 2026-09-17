import type {
  ApiError,
  AuthResponse,
  Booking,
  Cinema,
  HoldRequest,
  LoginRequest,
  MockPaymentRequest,
  MockPaymentResponse,
  MovieDetails,
  MoviesResponse,
  Payment,
  RegisterRequest,
  RefreshTokenRequest,
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
  ShowtimeMutationResponse,
  ShowtimeUpdateResponse,
  ShowtimeDeleteResponse,
  ProvincesResponse,
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
  const value = sessionStorage.getItem('ticket_booking_user');
  if (!value) return null;
  try {
    return JSON.parse(value) as User;
  } catch {
    clearAuth();
    return null;
  }
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

  if (response.status === 401 && retry && path !== '/auth/login' && sessionStorage.getItem(REFRESH_TOKEN_KEY)) {
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
  const token = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (!token) return false;

  const body: RefreshTokenRequest = { refreshToken: token };
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    clearAuth();
    return false;
  }
  setAuth((await response.json()) as AuthResponse);
  return true;
}

export const api = {
  async register(body: RegisterRequest) {
    const response = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setAuth(response);
    return response;
  },
  async login(body: LoginRequest) {
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
  provinces(signal?: AbortSignal) {
    return request<ProvincesResponse>('/locations/provinces', { signal });
  },
  movies(search = '', provinceCode?: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (search) params.set('search', search);
    if (provinceCode) params.set('provinceCode', String(provinceCode));
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
  showtimes(filters: { movieId?: string; cinemaId?: string; provinceCode?: number; from?: string; to?: string } = {}, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
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
  deleteShowtime(id: string) {
    return request<ShowtimeDeleteResponse>(`/showtimes/${id}`, { method: 'DELETE' });
  },
  showtime(id: string, signal?: AbortSignal) {
    return request<ShowtimeResponse>(`/showtimes/${id}`, { signal });
  },
  showtimeSeats(id: string, signal?: AbortSignal) {
    return request<ShowtimeSeatsResponse>(`/showtimes/${id}/seats`, { signal });
  },
  hold(showtimeId: string, showtimeSeatIds: string[], idempotencyKey = `hold-${crypto.randomUUID()}`) {
    const body: HoldRequest = { showtimeId, showtimeSeatIds };
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
    return request<Payment>(`/bookings/${bookingId}/checkout`, { method: 'POST' });
  },
  mockPayment(bookingId: string, success: boolean, idempotencyKey = `payment-${crypto.randomUUID()}`) {
    const body: MockPaymentRequest = { success };
    return request<MockPaymentResponse>(`/payments/mock/${bookingId}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
  },
  bookings(signal?: AbortSignal) {
    return request<Booking[]>('/bookings', { signal });
  },
  cancelBooking(id: string) {
    return request<Booking>(`/bookings/${id}/cancel`, { method: 'POST' });
  },
  ticket(id: string, signal?: AbortSignal) {
    return request<Ticket>(`/tickets/${id}`, { signal });
  },
  tickets(signal?: AbortSignal) {
    return request<Ticket[]>('/tickets', { signal });
  },
};
