import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import type { Cinema, Movie, MovieDetails, Showtime } from '../types';
import { formatDay, formatTime } from '../utils/format';
import { backdropStyle, catalogMovies, fallbackCinemas, fallbackMovieDetails, movieVisual, posterStyle, initials } from '../utils/media';


function cinemaPriceLabel(index: number) {
  const prices = ['75.000 – 95.000 đ', '90.000 – 115.000 đ', '130.000 – 190.000 đ'];
  return prices[index];
}

function Poster({ title, posterUrl, className = '' }: { title: string; posterUrl?: string | null; className?: string }) {
  const visual = movieVisual(title);
  return <div className={`poster-image ${className}`} style={posterStyle(title, posterUrl)} role="img" aria-label={`Poster ${title}`}><span>{posterUrl || visual.poster ? '' : initials(title)}</span></div>;
}

function MovieCard({ movie, showtimes = [] }: { movie: Movie; showtimes?: Showtime[] }) {
  const visual = movieVisual(movie.title);
  const quickShowtimes = showtimes.filter((showtime) => showtime.movieId === movie.id).slice(0, 3);
  const previewTimes = quickShowtimes.length ? quickShowtimes.map((showtime) => ({ id: showtime.id, label: formatTime(showtime.startsAt) })) : movie.title.toLowerCase().includes('dune') ? [{ label: '18:30' }, { label: '19:45 (IMAX)' }, { label: '21:15' }] : movie.title.toLowerCase().includes('godzilla') ? [{ label: '17:15' }, { label: '19:30 (3D)' }, { label: '21:40' }] : movie.title.toLowerCase().includes('exhuma') ? [{ label: '18:00' }, { label: '20:15' }, { label: '22:30' }] : [{ label: '15:00' }, { label: '17:20' }, { label: '19:10' }];
  return <article className="movie-card">
    <Link className="movie-poster-shell" to={`/movies/${movie.id}`}>
      <Poster title={movie.title} posterUrl={movie.posterUrl} />
      <div className="movie-badges"><span className="age-badge">{visual.age}</span><span className="format-badge">{visual.format}</span></div>
      <span className="rating-badge poster-rating">★ {visual.rating}</span><span className="poster-overlay">▶</span>
    </Link>
    <div className="movie-info">
      <Link to={`/movies/${movie.id}`}><h3>{movie.title}</h3></Link>
      <p>{visual.genre} <span>•</span> {movie.duration}'</p>
      <div className="movie-showtimes">{previewTimes.map((showtime) => 'id' in showtime ? <Link key={showtime.id} to={`/showtimes/${showtime.id}/seats`}>{showtime.label}</Link> : <span className="showtime-placeholder" key={showtime.label}>{showtime.label}</span>)}</div>
      <Link className="movie-buy" to={`/movies/${movie.id}`}>Mua vé <span>→</span></Link>
    </div>
  </article>;
}

function CinemaCard({ cinema, index }: { cinema: Cinema; index: number }) {
  return <article className="cinema-card">
    <div className={`cinema-card-art cinema-art-${index % 3}`}><span className="cinema-art-letter">{cinema.name.slice(0, 1)}</span><div><span className="format-chip">LASER 4K</span><span className="format-chip">DOLBY ATMOS</span></div></div>
    <div className="cinema-card-body">
      <div className="cinema-card-heading"><div><p className="eyebrow">CINEBOOK NETWORK</p><h2>{cinema.name}</h2></div><span className="rating-badge">4.8</span></div>
      <p className="cinema-address">⌖ {cinema.address}</p>
      <div className="cinema-meta"><span>{cinema.roomCount ?? 0} phòng chiếu</span><span>08:00 – 23:30</span></div>
      <div className="price-list"><div><span>2D tiêu chuẩn</span><strong>{cinemaPriceLabel(0)}</strong></div><div><span>3D kỹ thuật số</span><strong>{cinemaPriceLabel(1)}</strong></div><div><span>IMAX Laser</span><strong>{cinemaPriceLabel(2)}</strong></div></div>
      <div className="cinema-actions"><button className="secondary" type="button">Chỉ đường</button><Link className="primary" to={`/?cinemaId=${cinema.id}`}>Xem lịch chiếu</Link></div>
    </div>
  </article>;
}

function PromotionSection() {
  return <section className="promotion-section">
    <div className="section-heading"><div><p className="eyebrow">CINECLUB</p><h2>Ưu đãi & thành viên</h2></div><a href="#">Xem tất cả ưu đãi →</a></div>
    <div className="promotion-grid"><article className="promotion-card promotion-large"><span className="promotion-tag">ĐẶC QUYỀN HỌC SINH - SINH VIÊN</span><h3>Đồng giá vé chỉ từ 45.000đ</h3><p>Áp dụng từ thứ 2 đến thứ 6 khi xuất trình thẻ học sinh, sinh viên hoặc xác thực tài khoản CineClub.</p><button className="primary" type="button">Nhận ưu đãi ngay</button><strong className="promotion-price">45K</strong></article><article className="promotion-card"><span className="promotion-tag">CINEHAPPY TUESDAY</span><h3>Thứ Ba Vui Vẻ</h3><p>Vé chỉ 50K cho mọi định dạng ghế tiêu chuẩn và tặng bắp ngọt khi mua combo đôi.</p><strong className="promotion-total">50.000 VNĐ</strong></article></div>
  </section>;
}

export function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const search = searchParams.get('search') ?? '';
  const [selectedMovie, setSelectedMovie] = useState('');
  const [selectedCinema, setSelectedCinema] = useState(searchParams.get('cinemaId') ?? '');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedShowtime, setSelectedShowtime] = useState('');
  const moviesQuery = useQuery({ queryKey: ['movies', search], queryFn: () => api.movies(search) });
  const cinemasQuery = useQuery({ queryKey: ['cinemas'], queryFn: api.cinemas });
  const showtimesQuery = useQuery({ queryKey: ['showtimes'], queryFn: () => api.showtimes() });
  const movies = catalogMovies(moviesQuery.data?.data ?? []);
  const cinemas = cinemasQuery.data ?? [];
  const showtimesData = showtimesQuery.data?.data;
  const showtimes = useMemo(() => showtimesData ?? [], [showtimesData]);
  const dates = useMemo(() => [...new Set(showtimes.map((showtime) => new Date(showtime.startsAt).toISOString().slice(0, 10)))], [showtimes]);
  const quickShowtimes = useMemo(() => showtimes.filter((showtime) => (!selectedMovie || showtime.movieId === selectedMovie) && (!selectedCinema || showtime.room.cinemaId === selectedCinema) && (!selectedDate || showtime.startsAt.startsWith(selectedDate))), [selectedCinema, selectedDate, selectedMovie, showtimes]);
  const featuredMovie = movies.find((movie) => movie.title.toLowerCase().includes('dune')) ?? movies[0];
  const featuredVisual = movieVisual(featuredMovie?.title);


  return <>
    <section className="spotlight-hero" style={featuredMovie ? backdropStyle(featuredMovie.title, featuredMovie.backdropUrl) as CSSProperties : undefined}>
      <div className="spotlight-shade" /><div className="spotlight-content"><div className="spotlight-copy"><div className="hero-badges"><span className="age-badge">{featuredVisual.age}</span><span className="format-badge">{featuredVisual.format}</span><span className="rating-badge">★ {featuredVisual.rating} <small>/10</small></span><span className="hero-duration">◷ {featuredMovie?.duration ?? '166'} phút</span></div><p className="eyebrow">PHIM NỔI BẬT / CINEBOOK</p><h1>{featuredMovie?.title ?? 'Dune: Hành Tinh Cát 2'}</h1><p>{featuredMovie?.description ?? 'Khám phá những bộ phim đáng xem, chọn suất chiếu phù hợp và giữ chỗ chỉ trong vài bước.'}</p><div className="hero-actions"><a className="primary" href="#quick-booking">Đặt vé ngay <span>→</span></a><button className="secondary" type="button">▷ Xem trailer</button></div></div><div className="hero-pager"><span className="active" /><span /><span /><span /></div></div>
    </section>
    <section className="quick-booking" id="quick-booking"><div className="quick-booking-heading"><div><span className="quick-dot" /><h2>Thanh đặt vé nhanh</h2></div><small>Chọn nhanh 4 bước để giữ vị trí đẹp</small></div><div className="quick-booking-grid">{[[1, 'Chọn rạp', <select key="cinema" value={selectedCinema} onChange={(event) => { setSelectedCinema(event.target.value); setSelectedShowtime(''); }}><option value="">Tất cả cụm rạp</option>{cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select>], [2, 'Chọn phim', <select key="movie" value={selectedMovie} onChange={(event) => { setSelectedMovie(event.target.value); setSelectedShowtime(''); }}><option value="">Chọn phim</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select>], [3, 'Chọn ngày', <select key="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setSelectedShowtime(''); }}><option value="">Ngày gần nhất</option>{dates.map((date) => <option key={date} value={date}>{formatDay(date)}</option>)}</select>], [4, 'Chọn suất chiếu', <select key="showtime" value={selectedShowtime} onChange={(event) => setSelectedShowtime(event.target.value)}><option value="">Chọn suất</option>{quickShowtimes.map((showtime) => <option key={showtime.id} value={showtime.id}>{formatTime(showtime.startsAt)} · {showtime.room.cinema?.name}</option>)}</select>]].map(([number, label, control]) => <label className="quick-step" key={String(number)}><span><b>{number}</b>{label}</span>{control}</label>)}<button className="primary quick-booking-submit" type="button" disabled={!selectedShowtime} onClick={() => navigate(`/showtimes/${selectedShowtime}/seats`)}>Mua vé ngay <span>→</span></button></div></section>
    <section className="catalog-section" id="now-showing"><div className="section-heading catalog-heading"><div><p className="eyebrow">PHIM ĐANG CHIẾU</p><h2>Chọn câu chuyện tiếp theo</h2><p>Khám phá các bom tấn đỉnh cao tại hệ thống cụm rạp CineBook.</p></div></div><div className="filter-tabs"><button className="filter-chip active" type="button">Đang chiếu</button><button className="filter-chip" type="button">Suất chiếu đặc biệt</button><button className="filter-chip" type="button">Sắp chiếu</button></div>{moviesQuery.isPending && <LoadingState label="Đang tải danh sách phim…" />}{moviesQuery.isError && <ErrorState cause={moviesQuery.error} fallback="Không thể tải danh sách phim." onRetry={() => void moviesQuery.refetch()} />}{moviesQuery.isSuccess && !movies.length && <EmptyState>{search ? 'Không tìm thấy phim phù hợp.' : 'Chưa có phim đang chiếu.'}</EmptyState>}{movies.length > 0 && <div className="movie-grid">{movies.map((movie) => <MovieCard key={movie.id} movie={movie} showtimes={showtimes} />)}</div>}</section>
    <PromotionSection />
  </>;
}

export function CinemaPage() {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['cinemas'], queryFn: api.cinemas });
  const cinemas = query.data ?? [];
  const displayCinemas = (query.isError || query.isSuccess && !cinemas.length) ? fallbackCinemas : cinemas;
  const filteredCinemas = displayCinemas.filter((cinema) => `${cinema.name} ${cinema.address}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="cinemas-page"><div className="cinemas-hero"><PageHeader eyebrow="CINEBOOK NETWORK" title="Rạp & Giá Vé"><span className="network-count">{displayCinemas.length} cụm rạp</span></PageHeader><p>Chọn không gian phù hợp cho buổi chiếu tiếp theo. Từ phòng chiếu tiêu chuẩn đến trải nghiệm IMAX Laser.</p><label className="cinema-search"><span className="sr-only">Tìm rạp</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên rạp hoặc địa chỉ…" /></label></div><div className="city-chips"><button className="filter-chip active" type="button">Tất cả</button><button className="filter-chip" type="button">TP. Hồ Chí Minh</button><button className="filter-chip" type="button">Hà Nội</button><button className="filter-chip" type="button">Đà Nẵng</button></div>{query.isPending && <LoadingState label="Đang tải danh sách rạp…" />}{query.isSuccess && !filteredCinemas.length && <EmptyState>Không tìm thấy rạp phù hợp.</EmptyState>}{filteredCinemas.length > 0 && <div className="cinema-grid">{filteredCinemas.map((cinema, index) => <CinemaCard key={cinema.id} cinema={cinema} index={index} />)}</div>}</section>;
}

function showtimeGroups(movie: MovieDetails, cinemaId: string, date: string) {
  return movie.showtimes.filter((showtime) => (!cinemaId || showtime.room.cinemaId === cinemaId) && (!date || showtime.startsAt.startsWith(date))).reduce<Record<string, typeof movie.showtimes>>((groups, showtime) => { const day = new Date(showtime.startsAt).toISOString().slice(0, 10); groups[day] = [...(groups[day] ?? []), showtime]; return groups; }, {});
}

export function MoviePage() {
  const { movieId } = useParams();
  const [cinemaId, setCinemaId] = useState('');
  const [date, setDate] = useState('');
  const fallbackMovie = movieId ? fallbackMovieDetails(movieId) : null;
  const { data: movie, isPending, isError, error, refetch } = useQuery({ queryKey: ['movie', movieId], queryFn: () => fallbackMovie ?? api.movie(movieId!), enabled: Boolean(movieId) });
  const cinemasQuery = useQuery({ queryKey: ['cinemas'], queryFn: api.cinemas });
  if (isPending) return <LoadingState label="Đang tải thông tin phim…" />;
  if (isError) return <ErrorState cause={error} fallback="Không thể tải thông tin phim." onRetry={() => void refetch()} />;
  if (!movie) return <EmptyState>Không tìm thấy phim.</EmptyState>;
  const visual = movieVisual(movie.title);
  const dates = [...new Set(movie.showtimes.map((showtime) => new Date(showtime.startsAt).toISOString().slice(0, 10)))];
  const groups = showtimeGroups(movie, cinemaId, date);
  return <><div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Phim</span><span>›</span><strong>{movie.title}</strong></div><section className="movie-detail-hero" style={backdropStyle(movie.title, movie.backdropUrl) as CSSProperties}><div className="detail-hero-shade" /><div className="movie-detail-grid"><div><div className="detail-poster-wrap"><Poster title={movie.title} posterUrl={movie.posterUrl} className="detail-poster" /><div className="movie-badges"><span className="age-badge">{visual.age}</span><span className="format-badge">{visual.format}</span></div><span className="rating-badge poster-rating">★ {visual.rating} /10</span></div><div className="poster-meta">◉ 1.4M lượt xem trailer <button type="button">↗ Chia sẻ phim</button></div></div><div className="detail-copy"><div className="metadata-row"><span>{visual.age} - Khán giả trên 18 tuổi</span><span>{visual.genre.split(', ')[0]}</span><span>{visual.genre.split(', ')[1] ?? 'Phiêu lưu'}</span></div><p className="eyebrow">CHI TIẾT PHIM</p><h1 className="page-title">{movie.title}</h1><p className="original-title">CineBook Cinema • 2026</p><div className="detail-meta-grid"><div><small>Thời lượng</small><strong>◷ {movie.duration} phút</strong></div><div><small>Khởi chiếu</small><strong>◫ 01/03/2024</strong></div><div><small>Quốc gia</small><strong>◎ Hoa Kỳ</strong></div><div><small>Ngôn ngữ</small><strong>▤ Phụ đề</strong></div></div><p className="detail-description">{movie.description || 'Một hành trình điện ảnh đang chờ bạn khám phá.'}</p><div className="detail-cast"><div><span>Đạo diễn:</span><strong>Denis Villeneuve</strong></div><div><span>Diễn viên:</span><strong>Timothée Chalamet, Zendaya, Rebecca Ferguson</strong></div></div><div className="hero-actions"><a className="primary" href="#showtimes">Đặt vé ngay <span>→</span></a><button className="secondary" type="button">▷ Xem trailer</button><button className="secondary" type="button">♡ Yêu thích</button></div></div></div></section><section className="showtimes-section" id="showtimes"><div className="section-heading"><div><p className="eyebrow">LỊCH CHIẾU</p><h2>Chọn suất chiếu & đặt vé</h2></div></div><div className="date-strip">{dates.map((value) => <button className={`date-chip ${date === value ? 'active' : ''}`} key={value} type="button" onClick={() => setDate(date === value ? '' : value)}><small>{formatDay(value).split(',')[0]}</small><strong>{new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</strong><span>{formatDay(value).split(',').slice(-1)[0]}</span></button>)}</div><div className="showtime-toolbar"><span>RẠP:</span><select value={cinemaId} onChange={(event) => setCinemaId(event.target.value)}><option value="">Tất cả cụm rạp</option>{(cinemasQuery.data ?? []).map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select><div className="format-filters"><button className="filter-chip active" type="button">Tất cả định dạng</button><button className="filter-chip" type="button">2D phụ đề</button><button className="filter-chip" type="button">IMAX Laser</button></div></div>{!Object.keys(groups).length && <EmptyState>Phim chưa có suất chiếu phù hợp.</EmptyState>}<div className="showtime-days">{Object.entries(groups).map(([day, showtimes]) => <div className="showtime-day" key={day}><div className="showtime-day-heading"><div><h3>{movie.title}</h3><p>⌖ {showtimes[0]?.room?.cinema?.name ?? 'Rạp phim'} · {showtimes[0]?.room?.name ?? 'Phòng chiếu'}</p></div><a href="#">Bản đồ chỉ đường ↗</a></div><div className="showtime-list">{showtimes.map((showtime) => <Link key={showtime.id} className="showtime-card" to={`/showtimes/${showtime.id}/seats`}><strong>{formatTime(showtime.startsAt)}</strong><span>Đến {formatTime(showtime.endsAt)}</span><small>Còn ghế</small></Link>)}</div></div>)}</div></section></>;
}
