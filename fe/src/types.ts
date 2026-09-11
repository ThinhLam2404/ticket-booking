export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'CUSTOMER' | 'ADMIN';
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Movie {
  id: string;
  title: string;
  description?: string | null;
  duration: number;
  status: string;
}

export interface Cinema {
  id: string;
  name: string;
  address: string;
}

export interface Seat {
  id: string;
  row: string;
  number: number;
  type: 'STANDARD' | 'VIP' | 'COUPLE';
  roomId?: string;
}

export interface ShowtimeSeat {
  id: string;
  price: string;
  status: 'AVAILABLE' | 'HELD' | 'SOLD';
  heldUntil?: string | null;
  seat: Seat;
}

export interface Showtime {
  id: string;
  startsAt: string;
  endsAt: string;
  movie?: Movie;
  room?: {
    id: string;
    name: string;
    cinema?: Cinema;
  };
  showtimeSeats?: ShowtimeSeat[];
}

export interface BookingItem {
  id: string;
  price: string;
  showtimeSeatId: string;
  showtimeSeat?: ShowtimeSeat;
  ticket?: Ticket | null;
}

export interface Payment {
  id: string;
  provider: string;
  reference?: string | null;
  status: string;
  amount: string;
  bookingId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  status: string;
  totalAmount: string;
  expiresAt: string;
  showtimeId: string;
  showtime?: Showtime;
  items: BookingItem[];
  payment?: Payment | null;
  tickets: Ticket[];
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  code: string;
  status: string;
  bookingId: string;
  bookingItemId: string;
  usedAt?: string | null;
  createdAt: string;
  booking?: Booking;
  bookingItem?: BookingItem;
}

export interface ApiError {
  statusCode: number;
  code?: string;
  message: string | string[];
  details?: unknown[];
  path?: string;
  requestId?: string;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
