import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useLocationContext } from '../../auth/LocationContext';
import { EmptyState, ErrorState, LoadingState, TrailerModal } from '../../components/ui';
import { formatDay, formatTime, money as formatMoney } from '../../utils/format';
import { backdropStyle } from '../../utils/media';
import { MovieCard, roomFormatLabel, showtimeFormatLabel } from './components';

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
  const featuredMovie = bookingMovies.reduce<typeof bookingMovies[number] | undefined>((featured, movie) => {
    if (!featured || (movie.rating ?? -1) > (featured.rating ?? -1)) return movie;
    return featured;
  }, undefined);
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
