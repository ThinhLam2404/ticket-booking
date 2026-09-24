import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useLocationContext } from '../auth/LocationContext';
import { EmptyState, ErrorState, LoadingState, LocationPicker, PageHeader, TrailerModal } from '../components/ui';
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
  const previewTimes = quickShowtimes.length
    ? quickShowtimes.map((showtime) => ({ id: showtime.id, label: formatTime(showtime.startsAt) }))
    : [{ label: 'Chưa có suất' }];

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
    <div className={`cinema-card-art cinema-art-${index % 3}`}>
      <div className="cinema-art-mark" aria-hidden="true">{initials(cinema.name)}</div>
      <div className="cinema-art-badges"><span className="format-chip">LASER 4K</span><span className="format-chip">DOLBY ATMOS</span></div>
      <span className="cinema-room-count">{cinema.roomCount ?? 0} phòng chiếu</span>
    </div>
    <div className="cinema-card-body">
      <div className="cinema-card-heading"><div><p className="eyebrow">CINEBOOK NETWORK</p><h2>{cinema.name}</h2></div><span className="cinema-open-status"><span aria-hidden="true" /> Đang mở cửa</span></div>
      <p className="cinema-address"><span aria-hidden="true">⌖</span><span>{cinema.address}</span></p>
      <div className="cinema-meta"><span>⌂ {cinema.roomCount ?? 0} phòng chiếu</span><span>◷ 08:00 – 23:00</span></div>
      <div className="price-list"><div><span>2D tiêu chuẩn</span><strong>{cinemaPriceLabel(0)}</strong></div><div><span>3D kỹ thuật số</span><strong>{cinemaPriceLabel(1)}</strong></div><div><span>IMAX Laser</span><strong>{cinemaPriceLabel(2)}</strong></div></div>
      <div className="cinema-actions"><button className="secondary" type="button">Chỉ đường</button><Link className="primary" to={`/?cinemaId=${encodeURIComponent(cinema.id)}#quick-booking`}>Xem lịch chiếu</Link></div>
    </div>
  </article>;
}

function PromotionSection() {
  return <section className="promotion-section">
    <article className="promotion-banner">
      <div className="promotion-banner-icon" aria-hidden="true">▣</div>
      <div className="promotion-banner-copy"><span className="promotion-tag">CHƯƠNG TRÌNH ĐẶC BIỆT</span><h2>Thứ Ba Vui Vẻ – đồng giá vé 45.000đ toàn hệ thống</h2><p>Áp dụng cho tất cả định dạng 2D tiêu chuẩn tại mọi cụm rạp CineBook trên toàn quốc.</p></div>
      <button className="secondary" type="button">Xem chi tiết <span>→</span></button>
    </article>
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
  const [trailerOpen, setTrailerOpen] = useState(false);
  const { selectedProvinceCode, settledProvinceCode, selectedProvince } = useLocationContext();
  const moviesQuery = useQuery({ queryKey: ['movies', search, settledProvinceCode], queryFn: ({ signal }) => api.movies(search, settledProvinceCode, signal) });
  const cinemasQuery = useQuery({ queryKey: ['cinemas', settledProvinceCode], queryFn: ({ signal }) => api.cinemas(settledProvinceCode, signal) });
  const showtimesQuery = useQuery({ queryKey: ['showtimes', settledProvinceCode], queryFn: ({ signal }) => api.showtimes({ provinceCode: settledProvinceCode }, signal) });
  const movies = catalogMovies(moviesQuery.data?.data ?? [], settledProvinceCode === 79 && !moviesQuery.isSuccess);
  const cinemas = cinemasQuery.data ?? [];
  const showtimeData = showtimesQuery.data?.data;
  const showtimes = useMemo(() => showtimeData ?? [], [showtimeData]);
  const dates = useMemo(() => [...new Set(showtimes.map((showtime) => new Date(showtime.startsAt).toISOString().slice(0, 10)))], [showtimes]);
  const quickShowtimes = useMemo(() => showtimes.filter((showtime) => (!selectedMovie || showtime.movieId === selectedMovie) && (!selectedCinema || showtime.room.cinemaId === selectedCinema) && (!selectedDate || showtime.startsAt.startsWith(selectedDate))), [selectedCinema, selectedDate, selectedMovie, showtimes]);
  const featuredMovie = movies.find((movie) => movie.title.toLowerCase().includes('dune')) ?? movies[0];
  const featuredVisual = movieVisual(featuredMovie?.title);

  useEffect(() => {
    setSelectedCinema('');
    setSelectedMovie('');
    setSelectedDate('');
    setSelectedShowtime('');
  }, [selectedProvinceCode]);

  return <>
    <section className="spotlight-hero" style={featuredMovie ? backdropStyle(featuredMovie.title, featuredMovie.backdropUrl) as CSSProperties : undefined}>
      <div className="spotlight-shade" /><div className="spotlight-content"><div className="spotlight-copy"><div className="hero-badges"><span className="age-badge">{featuredVisual.age}</span><span className="format-badge">{featuredVisual.format}</span><span className="rating-badge">★ {featuredVisual.rating} <small>/10</small></span><span className="hero-duration">◷ {featuredMovie?.duration ?? '166'} phút</span></div><p className="eyebrow">PHIM NỔI BẬT / CINEBOOK</p><h1>{featuredMovie?.title ?? 'Dune: Hành Tinh Cát 2'}</h1><p>{featuredMovie?.description ?? `Khám phá những bộ phim đáng xem tại ${selectedProvince?.name ?? 'TP. Hồ Chí Minh'}, chọn suất chiếu phù hợp và giữ chỗ chỉ trong vài bước.`}</p><div className="hero-actions"><a className="primary" href="#quick-booking">Đặt vé ngay <span>→</span></a><button className="secondary" type="button" disabled={!featuredMovie?.trailerKey} onClick={() => setTrailerOpen(true)}>▷ {featuredMovie?.trailerKey ? 'Xem trailer' : 'Chưa có trailer'}</button></div></div><div className="hero-pager"><span className="active" /><span /><span /><span /></div></div>
    </section>
    <section className="quick-booking" id="quick-booking"><div className="quick-booking-heading"><div><span className="quick-dot" /><h2>Thanh đặt vé nhanh</h2></div><small>Chọn nhanh 4 bước để giữ vị trí đẹp</small></div><div className="quick-booking-grid">{[[1, 'Chọn rạp', <select key="cinema" value={selectedCinema} onChange={(event) => { setSelectedCinema(event.target.value); setSelectedShowtime(''); }}><option value="">Tất cả cụm rạp</option>{cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select>], [2, 'Chọn phim', <select key="movie" value={selectedMovie} onChange={(event) => { setSelectedMovie(event.target.value); setSelectedShowtime(''); }}><option value="">Chọn phim</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select>], [3, 'Chọn ngày', <select key="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setSelectedShowtime(''); }}><option value="">Ngày gần nhất</option>{dates.map((date) => <option key={date} value={date}>{formatDay(date)}</option>)}</select>], [4, 'Chọn suất chiếu', <select key="showtime" value={selectedShowtime} onChange={(event) => setSelectedShowtime(event.target.value)}><option value="">Chọn suất</option>{quickShowtimes.map((showtime) => <option key={showtime.id} value={showtime.id}>{formatTime(showtime.startsAt)} · {showtime.room.cinema?.name}</option>)}</select>]].map(([number, label, control]) => <label className="quick-step" key={String(number)}><span><b>{number}</b>{label}</span>{control}</label>)}<button className="primary quick-booking-submit" type="button" disabled={!selectedShowtime} onClick={() => navigate(`/showtimes/${selectedShowtime}/seats`)}>Mua vé ngay <span>→</span></button></div></section>
    <section className="catalog-section" id="now-showing"><div className="section-heading catalog-heading"><div><p className="eyebrow">PHIM ĐANG CHIẾU</p><h2>Chọn câu chuyện tiếp theo</h2><p>Khám phá các bom tấn đỉnh cao tại hệ thống cụm rạp CineBook.</p></div></div><div className="filter-tabs"><button className="filter-chip active" type="button">Đang chiếu</button><button className="filter-chip" type="button">Suất chiếu đặc biệt</button><button className="filter-chip" type="button">Sắp chiếu</button></div>{moviesQuery.isPending && <LoadingState label="Đang tải danh sách phim…" />}{moviesQuery.isError && <ErrorState cause={moviesQuery.error} fallback="Không thể tải danh sách phim." onRetry={() => void moviesQuery.refetch()} />}{moviesQuery.isSuccess && !movies.length && <EmptyState>{search ? 'Không tìm thấy phim phù hợp.' : `Chưa có phim đang chiếu tại ${selectedProvince?.name ?? 'khu vực này'}.`}</EmptyState>}{movies.length > 0 && <div className="movie-grid">{movies.map((movie) => <MovieCard key={movie.id} movie={movie} showtimes={showtimes} />)}</div>}</section>
    <PromotionSection />
    {trailerOpen && featuredMovie?.trailerKey && <TrailerModal movieTitle={featuredMovie.title} trailerKey={featuredMovie.trailerKey} onClose={() => setTrailerOpen(false)} />}
  </>;
}

export function CinemaPage() {
  const [search, setSearch] = useState('');
  const { selectedProvinceCode, settledProvinceCode, selectedProvince } = useLocationContext();
  const query = useQuery({ queryKey: ['cinemas', settledProvinceCode], queryFn: ({ signal }) => api.cinemas(settledProvinceCode, signal) });
  const cinemas = query.data ?? [];
  const displayCinemas = query.isError && selectedProvinceCode === 79 ? fallbackCinemas : cinemas;
  const filteredCinemas = displayCinemas.filter((cinema) => `${cinema.name} ${cinema.address}`.toLowerCase().includes(search.toLowerCase()));

  const totalRooms = displayCinemas.reduce((total, cinema) => total + (cinema.roomCount ?? 0), 0);

  return <section className="cinemas-page">
    <section className="cinemas-hero">
      <div className="cinemas-hero-inner">
        <div className="cinemas-hero-status"><span className="status-dot" /> HỆ THỐNG RẠP TOÀN QUỐC <span>•</span> {displayCinemas.length} cụm rạp đang hiển thị</div>
        <PageHeader eyebrow="CINEBOOK NETWORK" title="Rạp & Giá Vé" />
        <p>Không gian điện ảnh chuẩn quốc tế với phòng chiếu Laser 4K, IMAX và hệ thống âm thanh vòm Dolby Atmos tại <strong>{selectedProvince?.name ?? 'TP. Hồ Chí Minh'}</strong>.</p>
        <div className="cinema-hero-stats"><div><strong>{displayCinemas.length}</strong><span>Cụm rạp</span></div><div><strong>{totalRooms || '—'}</strong><span>Phòng chiếu</span></div><div><strong>08:00–23:00</strong><span>Giờ vận hành</span></div></div>
      </div>
    </section>
    <section className="cinema-directory" id="cum-rap">
      <div className="cinema-directory-toolbar"><div><p className="eyebrow">MẠNG LƯỚI CHIẾU PHIM HIỆN ĐẠI</p><h2>Khám phá cụm rạp gần bạn</h2></div><LocationPicker /></div>
      <label className="cinema-search"><span className="sr-only">Tìm rạp</span><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên rạp, đường hoặc quận…" /></label>
      <p className="cinema-directory-note">Đang lọc tại <strong>{selectedProvince?.name ?? 'TP. Hồ Chí Minh'}</strong>. Chọn rạp để xem lịch chiếu và giá vé.</p>
      {query.isPending && <LoadingState label="Đang tải danh sách rạp…" />}{query.isError && <ErrorState cause={query.error} fallback="Không thể tải danh sách rạp." onRetry={() => void query.refetch()} />}{query.isSuccess && !filteredCinemas.length && <EmptyState>Không tìm thấy rạp phù hợp tại khu vực này.</EmptyState>}{filteredCinemas.length > 0 && <div className="cinema-grid">{filteredCinemas.map((cinema, index) => <CinemaCard key={cinema.id} cinema={cinema} index={index} />)}</div>}
    </section>
  </section>;
}

function showtimeGroups(movie: MovieDetails, cinemaId: string, date: string) {
  return movie.showtimes.filter((showtime) => (!cinemaId || showtime.room.cinemaId === cinemaId) && (!date || showtime.startsAt.startsWith(date))).reduce<Record<string, typeof movie.showtimes>>((groups, showtime) => {
    const cinemaName = showtime.room.cinema?.name ?? 'Cụm rạp CineBook';
    groups[cinemaName] = [...(groups[cinemaName] ?? []), showtime];
    return groups;
  }, {});
}

export function MoviePage() {
  const { movieId } = useParams();
  const [cinemaId, setCinemaId] = useState('');
  const [date, setDate] = useState('');
  const [trailerOpen, setTrailerOpen] = useState(false);
  const { selectedProvinceCode, settledProvinceCode } = useLocationContext();
  const fallbackMovie = movieId ? fallbackMovieDetails(movieId) : null;
  const movieQuery = useQuery({ queryKey: ['movie', movieId, settledProvinceCode], queryFn: ({ signal }) => fallbackMovie ?? api.movie(movieId!, settledProvinceCode, signal), enabled: Boolean(movieId) });
  const cinemasQuery = useQuery({ queryKey: ['cinemas', settledProvinceCode], queryFn: ({ signal }) => api.cinemas(settledProvinceCode, signal) });

  useEffect(() => {
    setCinemaId('');
    setDate('');
  }, [selectedProvinceCode]);

  if (movieQuery.isPending) return <LoadingState label="Đang tải thông tin phim…" />;
  if (movieQuery.isError) return <ErrorState cause={movieQuery.error} fallback="Không thể tải thông tin phim." onRetry={() => void movieQuery.refetch()} />;
  const movie = movieQuery.data;
  if (!movie) return <EmptyState>Không tìm thấy phim.</EmptyState>;
  const visual = movieVisual(movie.title);
  const dates = [...new Set(movie.showtimes.map((showtime) => new Date(showtime.startsAt).toISOString().slice(0, 10)))];
  const groups = showtimeGroups(movie, cinemaId, date);

  return <>
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><Link to="/#now-showing">Phim</Link><span>›</span><strong>{movie.title}</strong></div>
    <section className="movie-detail-hero" style={backdropStyle(movie.title, movie.backdropUrl) as CSSProperties}>
      <div className="detail-hero-shade" />
      <div className="movie-detail-grid">
        <div>
          <div className="detail-poster-wrap"><Poster title={movie.title} posterUrl={movie.posterUrl} className="detail-poster" /><div className="movie-badges"><span className="age-badge">{visual.age}</span><span className="format-badge">{visual.format}</span></div></div>
          <div className="poster-meta"><span>{movie.trailerKey ? 'Trailer chính thức' : 'Thông tin phim CineBook'}</span><button type="button">↗ Chia sẻ phim</button></div>
        </div>
        <div className="detail-copy">
          <div className="metadata-row"><span>{visual.age}</span><span>{visual.genre.split(', ')[0]}</span><span>{visual.genre.split(', ')[1] ?? 'Điện ảnh'}</span><span>{movie.status === 'PUBLISHED' ? 'Đang chiếu' : 'Cập nhật'}</span></div>
          <p className="eyebrow">CHI TIẾT PHIM</p><h1 className="page-title">{movie.title}</h1><p className="original-title">CineBook Cinema · {movie.showtimes.length} suất chiếu đang có</p>
          <div className="detail-meta-grid"><div><small>Thời lượng</small><strong>◷ {movie.duration} phút</strong></div><div><small>Trạng thái</small><strong>{movie.status === 'PUBLISHED' ? 'Đang chiếu' : 'Chưa công chiếu'}</strong></div><div><small>Định dạng</small><strong>{visual.format}</strong></div><div><small>Suất chiếu</small><strong>{movie.showtimes.length} suất</strong></div></div>
          <p className="detail-description">{movie.description || 'Một hành trình điện ảnh đang chờ bạn khám phá.'}</p>
          <div className="detail-cast"><div><span>Phân loại:</span><strong>{visual.age} · {visual.genre}</strong></div><div><span>Hệ thống:</span><strong>CineBook · Chọn rạp và suất chiếu bên dưới</strong></div></div>
          <div className="hero-actions"><a className="primary" href="#showtimes">Đặt vé ngay <span>→</span></a><button className="secondary" type="button" disabled={!movie.trailerKey} onClick={() => setTrailerOpen(true)}>▷ {movie.trailerKey ? 'Xem trailer' : 'Chưa có trailer'}</button></div>
        </div>
      </div>
    </section>
    <section className="showtimes-section" id="showtimes">
      <div className="section-heading"><div><p className="eyebrow">SUẤT CHIẾU THEO NGÀY</p><h2>Lịch chiếu & đặt vé</h2><p>Chọn ngày, cụm rạp và giờ chiếu phù hợp để tiếp tục chọn ghế.</p></div><span className="showtime-info">◷ Giờ hiển thị theo GMT+7</span></div>
      <label className="showtime-filter-label">1. Chọn ngày chiếu</label><div className="date-strip">{dates.length ? dates.map((value, index) => <button className={`date-chip ${date === value || (!date && index === 0) ? 'active' : ''}`} key={value} type="button" onClick={() => setDate(date === value ? '' : value)}><small>{index === 0 ? 'Ngày gần nhất' : formatDay(value).split(',')[0]}</small><strong>{new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</strong><span>{formatDay(value).split(',').slice(-1)[0]}</span></button>) : <EmptyState>Chưa có ngày chiếu.</EmptyState>}</div>
      <div className="showtime-toolbar"><label><span>Chọn cụm rạp</span><select value={cinemaId} onChange={(event) => setCinemaId(event.target.value)}><option value="">Tất cả cụm rạp</option>{(cinemasQuery.data ?? []).map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select></label><div className="format-filters"><span>Định dạng</span><button className="filter-chip active" type="button">Tất cả</button><button className="filter-chip" type="button">{visual.format}</button></div></div>
      {!Object.keys(groups).length && <EmptyState>Phim chưa có suất chiếu phù hợp. Vui lòng chọn ngày hoặc cụm rạp khác.</EmptyState>}
      <div className="showtime-days">{Object.entries(groups).map(([cinemaName, showtimes]) => <div className="showtime-day" key={cinemaName}><div className="showtime-day-heading"><div><h3>{cinemaName}</h3><p>⌖ {showtimes[0]?.room?.name ?? 'Phòng chiếu'} · {showtimes.length} suất trong ngày đã chọn</p></div><span className="showtime-count">{showtimes.length} suất</span></div><div className="showtime-list">{showtimes.map((showtime) => <Link key={showtime.id} className="showtime-card" to={`/showtimes/${showtime.id}/seats`}><strong>{formatTime(showtime.startsAt)}</strong><span>Đến {formatTime(showtime.endsAt)}</span><small>{showtime.room?.name ?? 'Phòng chiếu'} · Chọn ghế →</small></Link>)}</div></div>)}</div>
    </section>
    {trailerOpen && movie.trailerKey && <TrailerModal movieTitle={movie.title} trailerKey={movie.trailerKey} onClose={() => setTrailerOpen(false)} />}
  </>;
}
