import { Link } from 'react-router-dom';
import type { Cinema, Movie, MovieDetails, Showtime } from '../../types';
import { formatTime, money as formatMoney } from '../../utils/format';
import { initials, posterStyle } from '../../utils/media';

export function roomFormatLabel(format?: string | null) {
  return format === 'IMAX' ? 'IMAX' : format === 'FOUR_DX' ? '4DX' : format === 'SCREEN_X' ? 'ScreenX' : 'Tiêu chuẩn';
}

export function showtimeFormatLabel(format?: string | null) {
  return format === 'THREE_D_SUBTITLED' ? '3D · Phụ đề' : format === 'THREE_D_DUBBED' ? '3D · Lồng tiếng' : format === 'TWO_D_DUBBED' ? '2D · Lồng tiếng' : format === 'TWO_D_SUBTITLED' ? '2D · Phụ đề' : 'Chưa phân loại';
}

export function Poster({ title, posterUrl, className = '' }: { title: string; posterUrl?: string | null; className?: string }) {
  return <div className={`poster-image ${className}`} style={posterStyle(title, posterUrl)} role="img" aria-label={`Poster ${title}`}><span>{posterUrl ? '' : initials(title)}</span></div>;
}

export function MovieCard({ movie, showtimes = [] }: { movie: Movie; showtimes?: Showtime[] }) {
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

export function CinemaCard({ cinema, index }: { cinema: Cinema; index: number }) {
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

export function showtimeGroups(movie: MovieDetails, cinemaId: string, date: string) {
  return movie.showtimes.filter((showtime) => (!cinemaId || showtime.room.cinemaId === cinemaId) && (!date || showtime.startsAt.startsWith(date))).reduce<Record<string, typeof movie.showtimes>>((groups, showtime) => {
    const cinemaName = showtime.room.cinema?.name ?? 'Cụm rạp CineBook';
    groups[cinemaName] = [...(groups[cinemaName] ?? []), showtime];
    return groups;
  }, {});
}
