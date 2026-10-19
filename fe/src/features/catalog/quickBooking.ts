import type { ShowtimesResponse } from '../../types';

type Showtime = ShowtimesResponse['data'][number];

const vietnamDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

export function vietnamDay(value: string) {
  const parts = vietnamDateFormatter.formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function availableDays(showtimes: Showtime[]) {
  return [...new Set(showtimes.map((showtime) => vietnamDay(showtime.startsAt)))];
}

export function filterQuickShowtimes(showtimes: Showtime[], filters: { movieId?: string; cinemaId?: string; day?: string }) {
  return showtimes.filter((showtime) =>
    (!filters.movieId || showtime.movieId === filters.movieId) &&
    (!filters.cinemaId || showtime.room.cinemaId === filters.cinemaId) &&
    (!filters.day || vietnamDay(showtime.startsAt) === filters.day));
}

export function hasShowtimeFor(showtimes: Showtime[], predicate: (showtime: Showtime) => boolean) {
  return showtimes.some(predicate);
}
