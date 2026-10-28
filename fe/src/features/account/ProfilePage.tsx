import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { formatDate } from '../../utils/format';

export function ProfilePage() {
  const query = useQuery({ queryKey: ['current-user'], queryFn: ({ signal }) => api.currentUser(signal) });
  if (query.isPending) return <LoadingState label="Đang tải thông tin tài khoản…" />;
  if (query.isError) return <ErrorState cause={query.error} fallback="Không thể tải thông tin tài khoản." onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const user = query.data;
  return <section className="records-page account-profile-page">
    <div className="breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Tài khoản</span><span>›</span><strong>Thông tin người dùng</strong></div>
    <div className="records-heading"><PageHeader eyebrow="TÀI KHOẢN / HỒ SƠ" title="Thông tin người dùng" /><p>Kiểm tra thông tin tài khoản và quản lý bảo mật đăng nhập.</p></div>
    <div className="profile-grid">
      <section className="security-card profile-card"><p className="eyebrow">HỒ SƠ CÁ NHÂN</p><div className="profile-avatar">{user.fullName.slice(0, 2).toUpperCase()}</div><dl className="profile-details"><div><dt>Họ và tên</dt><dd>{user.fullName}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Vai trò</dt><dd>{user.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'}</dd></div><div><dt>Ngày tham gia</dt><dd>{formatDate(user.createdAt)}</dd></div></dl></section>
      <section className="security-card profile-card"><p className="eyebrow">BẢO MẬT</p><h2>Quản lý đăng nhập</h2><p>Đổi mật khẩu và kiểm tra các thiết bị đang đăng nhập vào tài khoản của bạn.</p><Link className="primary profile-action" to="/account/security">Mở phần bảo mật</Link></section>
    </div>
  </section>;
}
