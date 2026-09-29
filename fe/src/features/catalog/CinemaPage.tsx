import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useLocationContext } from '../../auth/LocationContext';
import { EmptyState, ErrorState, LoadingState, LocationPicker, PageHeader } from '../../components/ui';
import { CinemaCard } from './components';

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
