import type { Cinema, Movie, MovieDetails } from '../types';

export type MovieVisual = {
  poster: string;
  backdrop: string;
  accent: string;
  rating: string;
  age: string;
  format: string;
  genre: string;
};

const visuals: Record<string, MovieVisual> = {
  dune: {
    poster: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDrVQk157UcdcjRIj5AA9TRJHIdy_tUuuheLJRwhbjheQeF8Gj8DVDEhAhrBHeL62697YP9sZGlZo9VAyDAFonnOI2D4eACsfrnH65hiXpPkyS1Nw7t6ibsU8tnmYKmc2VG38cTXaRt4yv-1iiGNsOOThm7TrHte4_iDxZP_bWIdw9VbVdmSjcJSjYTLvffVMk1bs9Kt5T2V5DZ5fYC7taA2CarcBBmADyMEb3QH0nAC5SOKZQws_fi',
    backdrop: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBHsEiWKBJPWg4_0NVHyBc2TomEvmi9iED_cGh2yGv6tttvjbk9FWgPskpCzHkjaT_tlTeWYNs28zUP_ir-scUCf5NT-g1bafF4ih6YsoXlmCFEp-vonD4s1lm_QNKFlP4ZDJ1ultqZvnnZStk5qzTzzhY18B-s5_ZDHT2TDCU7JJQQkhQB5uEJ-8eZ0FYfMKKjrdH7AxKnBf64Cu_lMUzIsQdf8fecdM5s7s5-zBR2QisaZ74YzrjG',
    accent: '#7c3aed',
    rating: '8.9',
    age: 'T18',
    format: 'IMAX 3D',
    genre: 'Hành Động, Viễn Tưởng',
  },
  godzilla: {
    poster: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCqhtLo3mhvNccqz5l80vqb58lLzPmcDlAprGaamMtKhr9m-g8Wypu8leWu-d97RDZi8DaE_WKbzV_qzreMxpBZ-D6Yn2B0hROjBPQSAHCVV8hPy_zflyI3c3Y0Z_9oGnxbv7elwltSHdWxf7SPlojG4JkTkkEdgm9my5f2825qJRx3SP2tc-zS_98L58AIrtqHuNjPE4EI5fJZemgyEGm80k0Lc8V6ANuPGPwPBLsWr633NU0-ozHN',
    backdrop: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTHgpYINGuW0GXqgVPx0ZgUwLNTXBIPFYVC0to8hMpKEVL4iBpZ5b2QtLRMkRdqcYWsq2N8iAyl4Hk7is4rihOqZuzwEcJCaQcB3y8dNIKJy6sWtGunoVdXPUmPpmrhSCBEYNAbROIRmbSzDXef1cFMKlPaXJsRV0jqkzG6zRxCGTjUuafnZm01Zrf8RFvrjOAc2s4mVy8OgsdZ5z5PUbXW18013mesZBvFVzG7a8qapxj4AKabGhq',
    accent: '#8b5cf6',
    rating: '8.2',
    age: 'T13',
    format: '3D',
    genre: 'Hành Động, Quái Thú',
  },
  exhuma: {
    poster: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCqm71f40yhGy0e41rNoXKK5QGqIqvgPRaaxo3EmbuKsTD78rTjm-noVsfr9iZbaXpI3bof5vvLeYeOpXblDLaqelx_xlOLUebvE7-Op7xc5osQmgkoV6b-Kn1OqHGpszbuqZu9wZ5vGKLE_lYLzTNafZa83ZshaRkRWS7M-lt7GUOcDgnlleJcamTgp0SUIjnY18CqlPRPHznXoxWhfClUADWOiwgO80m6aqeVEpXHbUnc75hyjs3V',
    backdrop: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDD88KBG6NYoUjJLRFKn7psxWC3spfxk5g_5B3VA4-fUPhG1ZpNqxHC2mKmjoBc7m3XL0ckGtk20mu172LnwSzd0Vnz4bkCvACevjIIeRJ8adV2zABbMNm-Z3Ro8gTdJy0VuaXaaiMQkONTKED4MIJUXQnS2LUGshoGspJFzHCiMazqZVYC7pUlJCYrI0J71YGV6jG-qb66y2lO-AVP0I_NE6eSCO9hPW5_eaU305nv_-PnvUhJd-Ht',
    accent: '#a855f7',
    rating: '8.5',
    age: 'T16',
    format: '2D',
    genre: 'Kinh Dị, Bí Ẩn',
  },
  panda: {
    poster: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB-HUVf8UV29mW-AckGrnZpU51XSGLBQVIavX2e7d3FA0-j-RTT9BFH6JgZLnYH1Q6kFghhxdeS7IFv5w3FU2cdNy4sq7jB3wa-Tre9VTONZ1gPKiAIWAe_-bWqrJYXnOZhA_1uhWJ0StBUUhvHmK71elvlD55gbpn6oO3OpmhVn9oxeqCaXE3qZeiM4qyKeNWNSW7cPZRSnsax672aKTs2oW2cOcqLU0x25An-MOVyQiqrw9oeigYb',
    backdrop: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBea425eMyvK3qf_5nQXils_KnZ7B4FEdvdkiC-w20hLHKnKyVzJFmNhsZzDvYyqgv314ZqVM6pcKwKiJcQiSn473TeJIYuiNq653gznxDAiMgDzRJxKfkPrjrE6MacJrjkYaE1ODRUvFuntuRMfnWLJ7b0cnnTonTJT8SDBqQXnvb86IZFOtO0sdcAOkEHv-ea0RiZWv7DkOSNvA7ank_cBNTV5TBavIRWw01ToKceqj-OOvk43Ogl',
    accent: '#c084fc',
    rating: '7.8',
    age: 'P',
    format: '2D Lồng Tiếng',
    genre: 'Hoạt Hình, Hài Hước',
  },
  default: {
    poster: '',
    backdrop: '',
    accent: '#7c3aed',
    rating: '—',
    age: 'P',
    format: '2D',
    genre: 'Điện ảnh',
  },
};

export const fallbackCinemas: Cinema[] = [
  {
    id: 'visual-cinema-central',
    name: 'CineBook Hai Bà Trưng',
     address: 'Vincom Plaza, Quận 1, TP. Hồ Chí Minh',
     provinceCode: 79,
     roomCount: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'visual-cinema-landmark',
    name: 'CineBook Landmark 81',
     address: 'Bình Thạnh, TP. Hồ Chí Minh',
     provinceCode: 79,
     roomCount: 7,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const fallbackMovies: Movie[] = [
  {
    id: 'visual-movie-dune',
    title: 'Dune: Hành Tinh Cát 2',
    description: 'Paul Atreides hợp lực cùng Chani và tộc người Fremen để trả thù những kẻ đã hủy hoại gia tộc mình, đối mặt định mệnh định hình vũ trụ.',
    duration: 166,
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'visual-movie-godzilla',
    title: 'Godzilla x Kong: Đế Chế Mới',
    description: 'Hai titan huyền thoại cùng đối mặt với mối đe dọa mới đang trỗi dậy từ thế giới ngầm.',
    duration: 115,
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'visual-movie-exhuma',
    title: 'Quật Mộ Trùng Ma (Exhuma)',
    description: 'Một nghi lễ khai quật bí ẩn mở ra chuỗi sự kiện siêu nhiên đáng sợ.',
    duration: 134,
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'visual-movie-panda',
    title: 'Kung Fu Panda 4',
    description: 'Po trở lại trong chuyến phiêu lưu hài hước để tìm kiếm người kế nhiệm Thần Long Đại Hiệp.',
    duration: 94,
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export function catalogMovies(movies: Movie[], allowFallback = true) {
  if (movies.length) return movies;
  return allowFallback ? fallbackMovies : [];
}

export function fallbackMovieDetails(movieId: string): MovieDetails | null {
  const movie = fallbackMovies.find((item) => item.id === movieId);
  return movie ? { ...movie, showtimes: [] } : null;
}

function visualKey(title: string) {
  const value = title.toLowerCase();
  if (value.includes('dune') || value.includes('hành tinh cát')) return 'dune';
  if (value.includes('godzilla') || value.includes('kong')) return 'godzilla';
  if (value.includes('exhuma') || value.includes('quật mộ')) return 'exhuma';
  if (value.includes('panda') || value.includes('kung fu')) return 'panda';
  return 'default';
}

export function movieVisual(title?: string | null) {
  return visuals[visualKey(title ?? '')];
}

export function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';
}

export function posterStyle(title?: string | null, posterUrl?: string | null) {
  const visual = movieVisual(title);
  const source = posterUrl || visual.poster;
  return source ? { backgroundImage: `url("${source}")` } : undefined;
}

export function backdropStyle(title?: string | null, backdropUrl?: string | null) {
  const visual = movieVisual(title);
  const source = backdropUrl || visual.backdrop;
  return source ? { backgroundImage: `url("${source}")` } : undefined;
}
