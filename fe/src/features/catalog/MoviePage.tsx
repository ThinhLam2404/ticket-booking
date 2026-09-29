import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useLocationContext } from '../../auth/LocationContext';
import { EmptyState, ErrorState, LoadingState, TrailerModal } from '../../components/ui';
import { formatDay, formatReleaseDate, formatTime, money as formatMoney } from '../../utils/format';
import { backdropStyle } from '../../utils/media';
import { Poster, roomFormatLabel, showtimeFormatLabel, showtimeGroups } from './components';

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
