import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, getStoredUser } from './api';
import type { Booking, Movie, Showtime, ShowtimeSeat, Ticket, User } from './types';
import './App.css';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function money(value: string | number) {
  return `${Number(value).toLocaleString('vi-VN')} đ`;
}

function App() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [view, setView] = useState<'home' | 'bookings' | 'tickets'>('home');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [showtimes, setShowtimes] = useState<Showtime[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(null);
  const [seatMap, setSeatMap] = useState<ShowtimeSeat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const selectedTotal = useMemo(
    () => selectedSeats.reduce((total, id) => total + Number(seatMap.find((seat) => seat.id === id)?.price ?? 0), 0),
    [selectedSeats, seatMap],
  );

  const loadMovies = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.movies(search);
      setMovies(result.data);
      const showtimeResult = await api.showtimes();
      setShowtimes(showtimeResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải catalog');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadMovies();
  }, [loadMovies]);

  async function selectMovie(movie: Movie) {
    setSelectedMovie(movie);
    setSelectedShowtime(null);
    try {
      const result = await api.showtimes(movie.id);
      setShowtimes(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải suất chiếu');
    }
  }

  async function selectShowtime(showtime: Showtime) {
    setSelectedShowtime(showtime);
    setSelectedSeats([]);
    try {
      const result = await api.showtimeSeats(showtime.id);
      setSeatMap(result.seats);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải sơ đồ ghế');
    }
  }

  function toggleSeat(seat: ShowtimeSeat) {
    if (seat.status !== 'AVAILABLE') return;
    setSelectedSeats((current) => current.includes(seat.id)
      ? current.filter((id) => id !== seat.id)
      : current.length < 10 ? [...current, seat.id] : current);
  }

  async function holdSeats() {
    if (!user) {
      setAuthMode('login');
      return;
    }
    if (!selectedShowtime || !selectedSeats.length) return;
    setLoading(true);
    try {
      const result = await api.hold(selectedShowtime.id, selectedSeats);
      setBooking(result);
      setNotice(`Đã giữ ${selectedSeats.length} ghế. Hạn giữ: ${formatDate(result.expiresAt)}`);
      setSelectedSeats([]);
      const refreshed = await api.showtimeSeats(selectedShowtime.id);
      setSeatMap(refreshed.seats);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể giữ ghế');
    } finally {
      setLoading(false);
    }
  }

  async function pay(success: boolean) {
    if (!booking) return;
    setLoading(true);
    try {
      await api.checkout(booking.id);
      const result = await api.mockPayment(booking.id, success);
      setBooking(result.booking);
      setNotice(success ? 'Checkout và thanh toán thành công, vé đã được phát hành.' : 'Checkout thành công nhưng thanh toán thất bại, ghế đã được giải phóng.');
      if (selectedShowtime) {
        const refreshed = await api.showtimeSeats(selectedShowtime.id);
        setSeatMap(refreshed.seats);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể thanh toán');
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    if (!user) return;
    try {
      setBookings(await api.bookings());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải booking');
    }
  }

  async function loadTickets() {
    if (!user) return;
    try {
      setTickets(await api.tickets());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải ticket');
    }
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setBooking(null);
    setBookings([]);
    setTickets([]);
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setView('home'); clearMessages(); }}>CineBook</button>
        <nav>
          <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>Khám phá</button>
          {user && <button className={view === 'bookings' ? 'active' : ''} onClick={() => { setView('bookings'); void loadBookings(); }}>Booking</button>}
          {user && <button className={view === 'tickets' ? 'active' : ''} onClick={() => { setView('tickets'); void loadTickets(); }}>Vé của tôi</button>}
        </nav>
        <div className="account">
          {user ? <><span>{user.fullName}</span><button className="ghost" onClick={() => void logout()}>Đăng xuất</button></> : <button className="primary" onClick={() => setAuthMode('login')}>Đăng nhập</button>}
        </div>
      </header>

      <main>
        <section className="hero-panel">
          <div>
            <p className="eyebrow">MOVIE TICKET BOOKING</p>
            <h1>Đặt chỗ tốt.<br /><span>Xem phim trọn vẹn.</span></h1>
            <p className="hero-copy">Giao diện test nhanh cho toàn bộ flow catalog, giữ ghế, thanh toán và ticket.</p>
          </div>
          <div className="hero-art"><span>NOW<br /><strong>SHOWING</strong></span></div>
        </section>

        {(notice || error) && <div className={error ? 'alert error' : 'alert success'}>{error || notice}<button onClick={clearMessages}>×</button></div>}

        {view === 'home' && <>
          <section className="toolbar">
            <div><p className="eyebrow">CATALOG</p><h2>Phim đang chiếu</h2></div>
            <form onSubmit={(event) => { event.preventDefault(); void loadMovies(); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên phim..." /><button className="secondary">Tìm</button></form>
          </section>
          <section className="movie-grid">
            {movies.map((movie) => <button key={movie.id} className={`movie-card ${selectedMovie?.id === movie.id ? 'selected' : ''}`} onClick={() => void selectMovie(movie)}><div className="poster"><span>{movie.title.slice(0, 1)}</span></div><div className="movie-info"><h3>{movie.title}</h3><p>{movie.duration} phút · {movie.status}</p></div></button>)}
            {!movies.length && !loading && <div className="empty">Chưa có phim published. Hãy chạy seed hoặc tạo phim bằng Swagger.</div>}
          </section>

          {selectedMovie && <section className="content-section"><div className="section-heading"><div><p className="eyebrow">SHOWTIMES</p><h2>{selectedMovie.title}</h2></div><button className="ghost" onClick={() => setSelectedMovie(null)}>Đóng</button></div><div className="showtime-list">{showtimes.filter((item) => item.movie?.id === selectedMovie.id).map((item) => <button key={item.id} className={`showtime-card ${selectedShowtime?.id === item.id ? 'selected' : ''}`} onClick={() => void selectShowtime(item)}><strong>{new Date(item.startsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</strong><span>{item.room?.cinema?.name ?? 'Cinema'} · {item.room?.name ?? 'Room'}</span></button>)}{!showtimes.filter((item) => item.movie?.id === selectedMovie.id).length && <div className="empty">Phim chưa có suất chiếu tương lai.</div>}</div></section>}

          {selectedShowtime && <section className="content-section"><div className="section-heading"><div><p className="eyebrow">SEAT MAP</p><h2>Chọn ghế</h2><p>{formatDate(selectedShowtime.startsAt)} · {selectedShowtime.room?.name}</p></div><div className="legend"><span><i className="dot available" />Trống</span><span><i className="dot held" />Đang giữ</span><span><i className="dot sold" />Đã bán</span></div></div><div className="screen">MÀN HÌNH</div><div className="seat-grid">{seatMap.map((seat) => <button key={seat.id} className={`seat ${seat.status.toLowerCase()} ${selectedSeats.includes(seat.id) ? 'chosen' : ''}`} onClick={() => toggleSeat(seat)} title={`${seat.seat.row}${seat.seat.number} · ${money(seat.price)}`}><small>{seat.seat.row}</small>{seat.seat.number}</button>)}</div><div className="booking-bar"><div><span>{selectedSeats.length} ghế đã chọn</span><strong>{money(selectedTotal)}</strong></div><button className="primary" disabled={!selectedSeats.length || loading} onClick={() => void holdSeats()}>Giữ ghế 10 phút</button></div></section>}

          {booking && booking.status === 'PENDING' && <section className="payment-panel"><div><p className="eyebrow">CHECKOUT</p><h2>Booking đang chờ thanh toán</h2><p>Hạn giữ: {formatDate(booking.expiresAt)}</p></div><div className="payment-actions"><strong>{money(booking.totalAmount)}</strong><button className="primary" disabled={loading} onClick={() => void pay(true)}>Mock success</button><button className="danger" disabled={loading} onClick={() => void pay(false)}>Mock fail</button></div></section>}
        </>}

        {view === 'bookings' && <section className="content-section"><div className="section-heading"><div><p className="eyebrow">ACCOUNT</p><h2>Booking của tôi</h2></div><button className="secondary" onClick={() => void loadBookings()}>Refresh</button></div><div className="records">{bookings.map((item) => <article className="record" key={item.id}><div><strong>{item.showtime?.movie?.title ?? item.showtimeId}</strong><p>{item.status} · {money(item.totalAmount)} · {formatDate(item.createdAt)}</p></div><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span></article>)}{!bookings.length && <div className="empty">Chưa có booking.</div>}</div></section>}

        {view === 'tickets' && <section className="content-section"><div className="section-heading"><div><p className="eyebrow">ACCOUNT</p><h2>Vé của tôi</h2></div><button className="secondary" onClick={() => void loadTickets()}>Refresh</button></div><div className="ticket-grid">{tickets.map((ticket) => <article className="ticket" key={ticket.id}><p className="eyebrow">{ticket.status}</p><h3>{ticket.code}</h3><p>{ticket.booking?.showtime?.movie?.title ?? 'Movie ticket'}</p><small>{ticket.bookingItem?.showtimeSeat?.seat?.row}{ticket.bookingItem?.showtimeSeat?.seat?.number}</small></article>)}{!tickets.length && <div className="empty">Chưa có ticket.</div>}</div></section>}
      </main>

      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onSuccess={(response) => { setUser(response.user); setAuthMode(null); setNotice(`Xin chào ${response.user.fullName}`); }} />}
    </div>
  );
}

function AuthModal({ mode, onClose, onSuccess }: { mode: 'login' | 'register'; onClose: () => void; onSuccess: (response: { user: User }) => void }) {
  const [register, setRegister] = useState(mode === 'register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('customer@example.com');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = register ? await api.register({ fullName, email, password }) : await api.login({ email, password });
      onSuccess(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xác thực');
    } finally {
      setLoading(false);
    }
  }

  return <div className="modal-backdrop"><form className="auth-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose}>×</button><p className="eyebrow">CINEBOOK</p><h2>{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h2>{register && <input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Họ và tên" />}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" /><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu" />{error && <p className="form-error">{error}</p>}<button className="primary" disabled={loading}>{loading ? 'Đang xử lý...' : register ? 'Đăng ký' : 'Đăng nhập'}</button><button type="button" className="link-button" onClick={() => setRegister((value) => !value)}>{register ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button></form></div>;
}

export default App;
