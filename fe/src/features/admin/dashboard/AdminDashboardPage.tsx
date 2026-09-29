import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../api";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui";
import type { Showtime } from "../../../types";
import { formatDate, formatTime } from "../../../utils/format";
import { AdminPage, dashboardShowtimeStatus } from "../shared";

export function AdminDashboardPage() {
  const moviesQuery = useQuery({
    queryKey: ["admin-movies", "dashboard"],
    queryFn: ({ signal }) => api.adminMovies({ pageSize: 100 }, signal),
  });
  const cinemasQuery = useQuery({
    queryKey: ["admin-cinemas"],
    queryFn: ({ signal }) => api.cinemas(undefined, signal),
  });
  const showtimesQuery = useQuery({
    queryKey: ["admin-showtimes", "dashboard"],
    queryFn: ({ signal }) =>
      api.adminShowtimes({ pageSize: 100, includePast: true }, signal),
  });
  const isPending =
    moviesQuery.isPending || cinemasQuery.isPending || showtimesQuery.isPending;
  const error = moviesQuery.error ?? cinemasQuery.error ?? showtimesQuery.error;
  const showtimes = showtimesQuery.data?.data ?? [];
  const liveShowtimes = showtimes.filter((showtime: Showtime) => dashboardShowtimeStatus(showtime).tone === "live").length;

  return (
    <AdminPage>
      <div className="admin-breadcrumb"><Link to="/admin">CineBook Admin</Link><span>›</span><strong>Tổng quan</strong></div>
      <div className="admin-dashboard-heading"><div><p className="eyebrow">CINEBOOK CONTROL</p><h1 className="page-title">Tổng quan vận hành</h1><p className="admin-lead">Theo dõi nội dung, cụm rạp và lịch chiếu từ một không gian vận hành tập trung.</p></div><div className="admin-dashboard-actions"><button className="secondary" type="button" onClick={() => { void moviesQuery.refetch(); void cinemasQuery.refetch(); void showtimesQuery.refetch(); }}>↻ Làm mới dữ liệu</button><Link className="primary" to="/admin/showtimes">+ Tạo suất chiếu</Link></div></div>
      {isPending && <LoadingState label="Đang tổng hợp dữ liệu…" />}
      {error && !isPending && <ErrorState cause={error} fallback="Không thể tải tổng quan." onRetry={() => { void moviesQuery.refetch(); void cinemasQuery.refetch(); void showtimesQuery.refetch(); }} />}
      {!isPending && !error && <>
        <div className="admin-stat-grid">
          <Link className="admin-stat-card admin-stat-card-cobalt" to="/admin/movies"><div className="admin-stat-top"><span className="admin-stat-label">Phim trong hệ thống</span><span className="admin-stat-icon">▣</span></div><strong>{moviesQuery.data?.meta.total ?? 0}</strong><span>Quản lý nội dung <b>→</b></span></Link>
          <Link className="admin-stat-card admin-stat-card-neutral" to="/admin/cinemas"><div className="admin-stat-top"><span className="admin-stat-label">Cụm rạp đang quản lý</span><span className="admin-stat-icon">▤</span></div><strong>{cinemasQuery.data?.length ?? 0}</strong><span>Rạp và phòng chiếu <b>→</b></span></Link>
          <Link className="admin-stat-card admin-stat-card-live" to="/admin/showtimes"><div className="admin-stat-top"><span className="admin-stat-label">Suất chiếu đã tải</span><span className="admin-stat-icon">◷</span></div><strong>{showtimesQuery.data?.meta.total ?? 0}</strong><span><i /> {liveShowtimes} suất đang diễn ra</span></Link>
        </div>
        <div className="admin-dashboard-grid">
          <section className="admin-panel admin-operations-panel"><div className="admin-panel-heading"><div><p className="eyebrow">LỊCH VẬN HÀNH</p><h2>Suất chiếu gần đây</h2><small>Trạng thái được tính theo giờ thực tế của suất chiếu.</small></div><Link to="/admin/showtimes">Xem toàn bộ →</Link></div>{showtimes.length === 0 ? <EmptyState>Chưa có suất chiếu để hiển thị.</EmptyState> : <div className="admin-recent-list">{showtimes.slice(0, 6).map((showtime) => { const status = dashboardShowtimeStatus(showtime); return <Link className="admin-recent-row" key={showtime.id} to="/admin/showtimes"><span className="admin-recent-time">{formatTime(showtime.startsAt)}</span><span><strong>{showtime.movie.title}</strong><small>{showtime.room.cinema?.name ?? "Cụm rạp"} · {showtime.room.name}</small></span><span className="admin-recent-date">{formatDate(showtime.startsAt)}</span><span className={`admin-operation-status ${status.tone}`}><i />{status.label}</span></Link>; })}</div>}</section>
          <section className="admin-panel admin-quick-panel"><div className="admin-panel-heading"><div><p className="eyebrow">TÁC VỤ NHANH</p><h2>Không gian điều hành</h2></div><span>{cinemasQuery.data?.length ?? 0} cụm rạp</span></div><div className="admin-quick-links"><Link to="/admin/movies"><span>▣</span><strong>Nội dung phim</strong><small>Quản lý trạng thái phát hành, poster và trailer.</small><b>→</b></Link><Link to="/admin/cinemas"><span>▤</span><strong>Rạp & phòng chiếu</strong><small>Kiểm tra phòng, layout ghế và sức chứa.</small><b>→</b></Link><Link to="/admin/showtimes"><span>◷</span><strong>Lịch vận hành</strong><small>Tạo suất lẻ, bulk schedule và khung giờ trống.</small><b>→</b></Link><Link to="/admin/payments"><span>₫</span><strong>Thanh toán SePay</strong><small>Rà soát giao dịch cần xử lý và hoàn tiền.</small><b>→</b></Link></div></section>
        </div>
      </>}
    </AdminPage>
  );
}
