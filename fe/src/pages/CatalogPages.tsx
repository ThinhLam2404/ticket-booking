import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useLocationContext } from '../auth/LocationContext';
import { EmptyState, ErrorState, LoadingState, LocationPicker, PageHeader, TrailerModal } from '../components/ui';
import type { Cinema, Movie, MovieDetails, Showtime } from '../types';
import { formatDay, formatReleaseDate, formatTime, money as formatMoney } from '../utils/format';
import { backdropStyle, posterStyle, initials } from '../utils/media';

function roomFormatLabel(format?: string | null) {
  return format === 'IMAX' ? 'IMAX' : format === 'FOUR_DX' ? '4DX' : format === 'SCREEN_X' ? 'ScreenX' : 'Tiêu chuẩn';
}

function showtimeFormatLabel(format?: string | null) {
  return format === 'THREE_D_SUBTITLED' ? '3D · Phụ đề' : format === 'THREE_D_DUBBED' ? '3D · Lồng tiếng' : format === 'TWO_D_DUBBED' ? '2D · Lồng tiếng' : format === 'TWO_D_SUBTITLED' ? '2D · Phụ đề' : 'Chưa phân loại';
}

function Poster({ title, posterUrl, className = '' }: { title: string; posterUrl?: string | null; className?: string }) {
  return <div className={`poster-image ${className}`} style={posterStyle(title, posterUrl)} role="img" aria-label={`Poster ${title}`}><span>{posterUrl ? '' : initials(title)}</span></div>;
}

function MovieCard({ movie, showtimes = [] }: { movie: Movie; showtimes?: Showtime[] }) {
  const quickShowtimes = showtimes.filter((showtime) => showtime.movieId === movie.id).slice(0, 3);
  const previewTimes = quickShowtimes.length
    ? quickShowtimes.map((showtime) => ({ id: showtime.id, label: formatTime(showtime.startsAt) }))
    : [{ label: 'Chưa có suất' }];

  return <article className="movie-card">
    <Link className="movie-poster-shell" to={`/movies/${movie.id}`}>
      <Poster title={movie.title} posterUrl={movie.posterUrl} />
      <div className="movie-badges">
        {movie.ageRating && <span className="age-badge">{movie.ageRating}</span>}
        {movie.rating != null && <span className="rating-badge">★ {movie.rating.toFixed(1)}</span>}
      </div>
      <span className="poster-overlay">▶</span>
    </Link>
    <div className="movie-info">
      <Link to={`/movies/${movie.id}`}><h3>{movie.title}</h3></Link>
      <p>{movie.duration} phút{movie.genres.length ? ` · ${movie.genres.slice(0, 2).join(' · ')}` : ''}</p>
      {movie.startingPrice != null && <small className="movie-starting-price">Từ {formatMoney(movie.startingPrice)}</small>}
      <div className="movie-showtimes">{previewTimes.map((showtime) => 'id' in showtime ? <Link key={showtime.id} to={`/showtimes/${showtime.id}/seats`}>{showtime.label}</Link> : <span className="showtime-placeholder" key={showtime.label}>{showtime.label}</span>)}</div>
      <Link className="movie-buy" to={`/movies/${movie.id}`}>Mua vé <span>→</span></Link>
    </div>
  </article>;
}

function CinemaCard({ cinema, index }: { cinema: Cinema; index: number }) {
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cinema.address)}`;
  return <article className="cinema-card">
    <div className={`cinema-card-art cinema-art-${index % 3}`}>
      <div className="cinema-art-mark" aria-hidden="true">{initials(cinema.name)}</div>
      <span className="cinema-room-count">{cinema.roomCount ?? 0} phòng chiếu</span>
    </div>
    <div className="cinema-card-body">
      <div className="cinema-card-heading"><div><p className="eyebrow">CINEBOOK NETWORK</p><h2>{cinema.name}</h2></div></div>
      <p className="cinema-address"><span aria-hidden="true">⌖</span><span>{cinema.address}</span></p>
      <div className="cinema-meta"><span>⌂ {cinema.roomCount ?? 0} phòng chiếu</span><span>{cinema.startingPrice != null ? `Giá từ ${formatMoney(cinema.startingPrice)}` : 'Lịch chiếu theo ngày'}</span></div>
      <div className="cinema-actions"><a className="secondary" href={directionsUrl} target="_blank" rel="noreferrer">Chỉ đường</a><Link className="primary" to={`/?cinemaId=${encodeURIComponent(cinema.id)}#quick-booking`}>Xem lịch chiếu</Link></div>
    </div>
  </article>;
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
  const [catalogCategory, setCatalogCategory] = useState<'NOW_SHOWING' | 'COMING_SOON' | 'SPECIAL'>('NOW_SHOWING');
  const { selectedProvinceCode, settledProvinceCode, selectedProvince } = useLocationContext();
  const moviesQuery = useQuery({ queryKey: ['movies', search, settledProvinceCode, catalogCategory], queryFn: ({ signal }) => api.movies(search, settledProvinceCode, catalogCategory, signal) });
  const bookingMoviesQuery = useQuery({ queryKey: ['movies', search, settledProvinceCode, 'NOW_SHOWING'], queryFn: ({ signal }) => api.movies(search, settledProvinceCode, 'NOW_SHOWING', signal) });
  const cinemasQuery = useQuery({ queryKey: ['cinemas', settledProvinceCode], queryFn: ({ signal }) => api.cinemas(settledProvinceCode, signal) });
  const showtimesQuery = useQuery({ queryKey: ['showtimes', settledProvinceCode], queryFn: ({ signal }) => api.showtimes({ provinceCode: settledProvinceCode }, signal) });
  const movies = moviesQuery.data?.data ?? [];
  const bookingMovies = bookingMoviesQuery.data?.data ?? [];
  const cinemas = cinemasQuery.data ?? [];
  const showtimeData = showtimesQuery.data?.data;
  const showtimes = useMemo(() => showtimeData ?? [], [showtimeData]);
  const dates = useMemo(() => [...new Set(showtimes.map((showtime) => new Date(showtime.startsAt).toISOString().slice(0, 10)))], [showtimes]);
  const quickShowtimes = useMemo(() => showtimes.filter((showtime) => (!selectedMovie || showtime.movieId === selectedMovie) && (!selectedCinema || showtime.room.cinemaId === selectedCinema) && (!selectedDate || showtime.startsAt.startsWith(selectedDate))), [selectedCinema, selectedDate, selectedMovie, showtimes]);
  const catalogShowtimes = useMemo(() => catalogCategory === 'SPECIAL'
    ? showtimes.filter((showtime) => showtime.room.format !== 'STANDARD' || showtime.format === 'THREE_D_SUBTITLED' || showtime.format === 'THREE_D_DUBBED')
    : catalogCategory === 'COMING_SOON' ? [] : showtimes, [catalogCategory, showtimes]);
  const featuredMovie = bookingMovies[0];
  const catalogLabel = catalogCategory === 'COMING_SOON' ? 'PHIM SẮP CHIẾU' : catalogCategory === 'SPECIAL' ? 'SUẤT CHIẾU ĐẶC BIỆT' : 'PHIM ĐANG CHIẾU';

  useEffect(() => {
    setSelectedCinema('');
    setSelectedMovie('');
    setSelectedDate('');
    setSelectedShowtime('');
  }, [selectedProvinceCode]);

  return <>
    <section className="spotlight-hero" style={featuredMovie ? backdropStyle(featuredMovie.title, featuredMovie.backdropUrl) as CSSProperties : undefined}>
      <div className="spotlight-shade" /><div className="spotlight-content"><div className="spotlight-copy"><div className="hero-badges"><span className="hero-duration">◷ {featuredMovie?.duration ?? '—'} phút</span></div><p className="eyebrow">PHIM ĐANG CHIẾU / CINEBOOK</p><h1>{featuredMovie?.title ?? 'Khám phá phim đang chiếu'}</h1><p>{featuredMovie?.description ?? `Chọn suất chiếu phù hợp tại ${selectedProvince?.name ?? 'khu vực của bạn'} và giữ ghế trong vài bước.`}</p><div className="hero-actions"><a className="primary" href="#quick-booking">Đặt vé ngay <span>→</span></a><button className="secondary" type="button" disabled={!featuredMovie?.trailerKey} onClick={() => setTrailerOpen(true)}>▷ {featuredMovie?.trailerKey ? 'Xem trailer' : 'Chưa có trailer'}</button></div></div></div>
    </section>
    <section className="quick-booking" id="quick-booking"><div className="quick-booking-heading"><div><span className="quick-dot" /><h2>Thanh đặt vé nhanh</h2></div><small>Chọn nhanh 4 bước để giữ vị trí đẹp</small></div><div className="quick-booking-grid">{[[1, 'Chọn rạp', <select key="cinema" value={selectedCinema} onChange={(event) => { setSelectedCinema(event.target.value); setSelectedShowtime(''); }}><option value="">Tất cả cụm rạp</option>{cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select>], [2, 'Chọn phim', <select key="movie" value={selectedMovie} onChange={(event) => { setSelectedMovie(event.target.value); setSelectedShowtime(''); }}><option value="">Chọn phim</option>{bookingMovies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select>], [3, 'Chọn ngày', <select key="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setSelectedShowtime(''); }}><option value="">Ngày gần nhất</option>{dates.map((date) => <option key={date} value={date}>{formatDay(date)}</option>)}</select>], [4, 'Chọn suất chiếu', <select key="showtime" value={selectedShowtime} onChange={(event) => setSelectedShowtime(event.target.value)}><option value="">Chọn suất</option>{quickShowtimes.map((showtime) => <option key={showtime.id} value={showtime.id}>{formatTime(showtime.startsAt)} · {roomFormatLabel(showtime.room.format)} · {showtimeFormatLabel(showtime.format)} · {showtime.basePrice != null ? formatMoney(Number(showtime.basePrice)) : 'Giá đang cập nhật'} · {showtime.room.cinema?.name}</option>)}</select>]].map(([number, label, control]) => <label className="quick-step" key={String(number)}><span><b>{number}</b>{label}</span>{control}</label>)}<button className="primary quick-booking-submit" type="button" disabled={!selectedShowtime} onClick={() => navigate(`/showtimes/${selectedShowtime}/seats`)}>Mua vé ngay <span>→</span></button></div></section>
    <section className="catalog-section" id="now-showing"><div className="section-heading catalog-heading"><div><p className="eyebrow">{catalogLabel}</p><h2>Chọn câu chuyện tiếp theo</h2><p>Khám phá các bom tấn đỉnh cao tại hệ thống cụm rạp CineBook.</p></div></div><div className="filter-tabs"><button className={`filter-chip ${catalogCategory === 'NOW_SHOWING' ? 'active' : ''}`} type="button" onClick={() => setCatalogCategory('NOW_SHOWING')}>Đang chiếu</button><button className={`filter-chip ${catalogCategory === 'SPECIAL' ? 'active' : ''}`} type="button" onClick={() => setCatalogCategory('SPECIAL')}>Suất chiếu đặc biệt</button><button className={`filter-chip ${catalogCategory === 'COMING_SOON' ? 'active' : ''}`} type="button" onClick={() => setCatalogCategory('COMING_SOON')}>Sắp chiếu</button></div>{moviesQuery.isPending && <LoadingState label="Đang tải danh sách phim…" />}{moviesQuery.isError && <ErrorState cause={moviesQuery.error} fallback="Không thể tải danh sách phim." onRetry={() => void moviesQuery.refetch()} />}{moviesQuery.isSuccess && !movies.length && <EmptyState>{search ? 'Không tìm thấy phim phù hợp.' : `Chưa có phim đang chiếu tại ${selectedProvince?.name ?? 'khu vực này'}.`}</EmptyState>}{movies.length > 0 && <div className="movie-grid">{movies.map((movie) => <MovieCard key={movie.id} movie={movie} showtimes={catalogShowtimes} />)}</div>}</section>
    {trailerOpen && featuredMovie?.trailerKey && <TrailerModal movieTitle={featuredMovie.title} trailerKey={featuredMovie.trailerKey} onClose={() => setTrailerOpen(false)} />}
  </>;
}

export function CinemaPage() {
  const [search, setSearch] = useState('');
  const { settledProvinceCode, selectedProvince } = useLocationContext();
  const query = useQuery({ queryKey: ['cinemas', settledProvinceCode], queryFn: ({ signal }) => api.cinemas(settledProvinceCode, signal) });
  const cinemas = query.data ?? [];
  const displayCinemas = cinemas;
  const filteredCinemas = displayCinemas.filter((cinema) => `${cinema.name} ${cinema.address}`.toLowerCase().includes(search.toLowerCase()));

  const totalRooms = displayCinemas.reduce((total, cinema) => total + (cinema.roomCount ?? 0), 0);

  return <section className="cinemas-page">
    <section className="cinemas-hero">
      <div className="cinemas-hero-inner">
        <div className="cinemas-hero-status"><span className="status-dot" /> HỆ THỐNG RẠP TOÀN QUỐC <span>•</span> {displayCinemas.length} cụm rạp đang hiển thị</div>
        <PageHeader eyebrow="CINEBOOK NETWORK" title="Rạp & Giá Vé" />
        <p>Khám phá các cụm rạp CineBook tại <strong>{selectedProvince?.name ?? 'khu vực của bạn'}</strong>, chọn suất chiếu và tiếp tục giữ ghế theo lịch thực tế.</p>
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
  const movieQuery = useQuery({ queryKey: ['movie', movieId, settledProvinceCode], queryFn: ({ signal }) => api.movie(movieId!, settledProvinceCode, signal), enabled: Boolean(movieId) });
  const cinemasQuery = useQuery({ queryKey: ['cinemas', settledProvinceCode], queryFn: ({ signal }) => api.cinemas(settledProvinceCode, signal) });

  useEffect(() => {
    setCinemaId('');
    setDate('');
  }, [selectedProvinceCode]);

  if (movieQuery.isPending) return <LoadingState label="Đang tải thông tin phim…" />;
  if (movieQuery.isError) return <ErrorState cause={movieQuery.error} fallback="Không thể tải thông tin phim." onRetry={() => void movieQuery.refetch()} />;
  const movie = movieQuery.data;
  if (!movie) return <EmptyState>Không tìm thấy phim.</EmptyState>;
  const dates = [...new Set(movie.showtimes.map((showtime) => new Date(showtime.startsAt).toISOString().slice(0, 10)))];
  const groups = showtimeGroups(movie, cinemaId, date);

  return <>
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><Link to="/#now-showing">Phim</Link><span>›</span><strong>{movie.title}</strong></div>
    <section className="movie-detail-hero" style={backdropStyle(movie.title, movie.backdropUrl) as CSSProperties}>
      <div className="detail-hero-shade" />
      <div className="movie-detail-grid">
        <div>
          <div className="detail-poster-wrap"><Poster title={movie.title} posterUrl={movie.posterUrl} className="detail-poster" /></div>
          <div className="poster-meta"><span>{movie.trailerKey ? 'Trailer chính thức' : 'Thông tin phim CineBook'}</span><button type="button" onClick={() => { void navigator.clipboard?.writeText(window.location.href); }}>↗ Sao chép liên kết</button></div>
        </div>
        <div className="detail-copy">
           <div className="metadata-row"><span>{movie.status === 'PUBLISHED' ? 'Đang chiếu' : 'Cập nhật'}</span>{movie.ageRating && <span className="age-badge">{movie.ageRating}</span>}{movie.rating != null && <span className="rating-badge">★ {movie.rating.toFixed(1)} TMDB</span>}</div>
           <p className="eyebrow">CHI TIẾT PHIM</p><h1 className="page-title">{movie.title}</h1><p className="original-title">CineBook Cinema · {movie.showtimes.length} suất chiếu đang có</p>
           <div className="detail-meta-grid"><div><small>Thời lượng</small><strong>◷ {movie.duration} phút</strong></div><div><small>Khởi chiếu</small><strong>{formatReleaseDate(movie.releaseDate)}</strong></div><div><small>Thể loại</small><strong>{movie.genres.length ? movie.genres.slice(0, 2).join(' · ') : 'Chưa cập nhật'}</strong></div><div><small>Suất chiếu</small><strong>{movie.showtimes.length} suất</strong></div></div>
          <p className="detail-description">{movie.description || 'Thông tin mô tả cho phim này chưa được cập nhật.'}</p>
          <div className="detail-cast"><div><span>Hệ thống:</span><strong>CineBook · Chọn rạp và suất chiếu bên dưới</strong></div></div>
          <div className="hero-actions"><a className="primary" href="#showtimes">Đặt vé ngay <span>→</span></a><button className="secondary" type="button" disabled={!movie.trailerKey} onClick={() => setTrailerOpen(true)}>▷ {movie.trailerKey ? 'Xem trailer' : 'Chưa có trailer'}</button></div>
        </div>
      </div>
    </section>
    <section className="showtimes-section" id="showtimes">
      <div className="section-heading"><div><p className="eyebrow">SUẤT CHIẾU THEO NGÀY</p><h2>Lịch chiếu & đặt vé</h2><p>Chọn ngày, cụm rạp và giờ chiếu phù hợp để tiếp tục chọn ghế.</p></div><span className="showtime-info">◷ Giờ hiển thị theo GMT+7</span></div>
      <label className="showtime-filter-label">1. Chọn ngày chiếu</label><div className="date-strip">{dates.length ? dates.map((value, index) => <button className={`date-chip ${date === value || (!date && index === 0) ? 'active' : ''}`} key={value} type="button" onClick={() => setDate(date === value ? '' : value)}><small>{index === 0 ? 'Ngày gần nhất' : formatDay(value).split(',')[0]}</small><strong>{new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</strong><span>{formatDay(value).split(',').slice(-1)[0]}</span></button>) : <EmptyState>Chưa có ngày chiếu.</EmptyState>}</div>
      <div className="showtime-toolbar"><label><span>Chọn cụm rạp</span><select value={cinemaId} onChange={(event) => setCinemaId(event.target.value)}><option value="">Tất cả cụm rạp</option>{(cinemasQuery.data ?? []).map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}</select></label></div>
      {!Object.keys(groups).length && <EmptyState>Phim chưa có suất chiếu phù hợp. Vui lòng chọn ngày hoặc cụm rạp khác.</EmptyState>}
      <div className="showtime-days">{Object.entries(groups).map(([cinemaName, showtimes]) => <div className="showtime-day" key={cinemaName}><div className="showtime-day-heading"><div><h3>{cinemaName}</h3><p>⌖ {showtimes[0]?.room?.name ?? 'Phòng chiếu'} · {showtimes.length} suất trong ngày đã chọn</p></div><span className="showtime-count">{showtimes.length} suất</span></div><div className="showtime-list">{showtimes.map((showtime) => <Link key={showtime.id} className="showtime-card" to={`/showtimes/${showtime.id}/seats`}><strong>{formatTime(showtime.startsAt)}</strong><span>Đến {formatTime(showtime.endsAt)}</span><small>{roomFormatLabel(showtime.room?.format)} · {showtimeFormatLabel(showtime.format)} · {showtime.basePrice != null ? `Từ ${formatMoney(Number(showtime.basePrice))}` : 'Giá đang cập nhật'} · Chọn ghế →</small></Link>)}</div></div>)}</div>
    </section>
    {trailerOpen && movie.trailerKey && <TrailerModal movieTitle={movie.title} trailerKey={movie.trailerKey} onClose={() => setTrailerOpen(false)} />}
  </>;
}
