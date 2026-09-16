import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { User } from '../types';
import { errorMessage, statusLabel } from '../utils/format';

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return <div className="state-card loading-state" role="status"><span className="spinner" />{label}</div>;
}

export function ErrorState({ cause, fallback, onRetry }: { cause: unknown; fallback: string; onRetry?: () => void }) {
  return <div className="state-card error-state" role="alert"><div><span className="state-icon">!</span><strong>{errorMessage(cause, fallback)}</strong></div>{onRetry && <button className="secondary" onClick={onRetry}>Thử lại</button>}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state-card empty-state"><span className="state-icon">◌</span><span>{children}</span></div>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status.toLowerCase()}`}>{statusLabel(status)}</span>;
}

export function Alert({ type, children, onClose }: { type: 'success' | 'error'; children: ReactNode; onClose?: () => void }) {
  return <div className={`alert ${type}`} role={type === 'error' ? 'alert' : 'status'}><span>{children}</span>{onClose && <button aria-label="Đóng thông báo" onClick={onClose}>×</button>}</div>;
}

function navClass(pathname: string, target: string) {
  return pathname === target || (target !== '/' && pathname.startsWith(target)) ? 'active' : '';
}

export function Layout() {
  const { user, authMode, closeAuth, logout, openAuth } = useAuth();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [headerState, setHeaderState] = useState<'expanded' | 'compact' | 'hidden'>('expanded');
  const lastScroll = useRef(0);

  useEffect(() => {
    function updateHeader() {
      const currentScroll = window.scrollY;
      const delta = currentScroll - lastScroll.current;
      if (currentScroll <= 24) setHeaderState('expanded');
      else if (delta > 8) setHeaderState('hidden');
      else if (delta < -8) setHeaderState('compact');
      lastScroll.current = currentScroll;
    }
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return <div className="app-shell">
    <header className={`topbar topbar-${headerState}`}>
      <div className="topbar-inner">
        <Link className="brand" to="/"><span className="brand-mark">▰</span><span>Cine<span>Book</span></span></Link>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          <Link className={navClass(location.pathname, '/')} to="/#now-showing">Phim</Link>
          <Link className={navClass(location.pathname, '/cinemas')} to="/cinemas">Rạp & Giá Vé</Link>
          {user && <Link className={navClass(location.pathname, '/bookings')} to="/bookings">Booking</Link>}
          {user && <Link className={navClass(location.pathname, '/tickets')} to="/tickets">Vé của tôi</Link>}
        </nav>
        <div className="topbar-actions">
          <button className="location-pill" type="button"><span>⌖</span><span>TP. Hồ Chí Minh</span><span>⌄</span></button>
          <Link className="search-button" aria-label="Tìm kiếm phim" to="/#now-showing">⌕</Link>
          {user ? <div className="account-menu"><span className="account-avatar">{user.fullName.slice(0, 2).toUpperCase()}</span><span className="account-name">{user.fullName}</span><button className="ghost" disabled={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? 'Đang thoát…' : 'Đăng xuất'}</button></div> : <button className="primary login-button" onClick={() => openAuth()}>Đăng nhập</button>}
        </div>
      </div>
    </header>
    <main><Outlet /></main>
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand"><Link className="brand" to="/"><span className="brand-mark">▰</span><span>Cine<span>Book</span></span></Link><p>Hệ thống đặt vé xem phim trực tuyến hiện đại. Chọn suất chiếu, giữ ghế và bước vào thế giới điện ảnh.</p><strong>Hotline hỗ trợ: 1900 6868</strong></div>
        <div><h3>Về CineBook</h3><Link to="/cinemas">Cụm rạp toàn quốc</Link><Link to="/#now-showing">Phim đang chiếu</Link><Link to="/">Tin điện ảnh</Link></div>
        <div><h3>Chính sách</h3><a href="#">Chính sách thanh toán</a><a href="#">Điều khoản sử dụng</a><a href="#">Bảo mật thông tin</a></div>
        <div><h3>Đối tác</h3><div className="partner-list"><span>IMAX</span><span>Dolby</span><span>MoMo</span><span>VNPAY</span><span>Visa</span><span>ZaloPay</span></div></div>
      </div>
      <div className="footer-bottom"><span>© 2026 CineBook Vietnam. All rights reserved.</span><span>Trải nghiệm điện ảnh trong tầm tay.</span></div><p className="tmdb-footer-attribution">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </footer>
    <nav className="mobile-nav" aria-label="Điều hướng di động"><Link className={navClass(location.pathname, '/')} to="/"><span>⌂</span><small>Trang chủ</small></Link><Link className={navClass(location.pathname, '/#now-showing')} to="/#now-showing"><span>▣</span><small>Phim</small></Link><Link className={navClass(location.pathname, '/cinemas')} to="/cinemas"><span>▤</span><small>Rạp chiếu</small></Link>{user ? <Link className={navClass(location.pathname, '/tickets')} to="/tickets"><span>▱</span><small>Vé của tôi</small></Link> : <button onClick={() => openAuth()}><span>◉</span><small>Tài khoản</small></button>}</nav>
    {authMode && <AuthModal mode={authMode} onClose={closeAuth} />}
  </div>;
}

export function RequireAuth() {
  const { user, openAuth } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (!user) openAuth();
  }, [openAuth, user]);
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user || user.role !== 'ADMIN') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return <div className={`admin-shell${sidebarOpen ? ' admin-sidebar-open' : ''}`}>
    <button className="admin-sidebar-scrim" type="button" aria-label="Đóng menu quản trị" onClick={closeSidebar} />
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand"><Link className="brand" to="/" onClick={closeSidebar}><span className="brand-mark">▰</span><span>Cine<span>Book</span></span></Link><span className="admin-sidebar-label">CINEBOOK CONTROL</span><button className="admin-sidebar-close" type="button" aria-label="Đóng menu quản trị" onClick={closeSidebar}>×</button></div>
      <nav className="admin-sidebar-nav" aria-label="Quản trị CineBook">
        <Link className={location.pathname === '/admin' ? 'active' : ''} to="/admin" onClick={closeSidebar}><span>⌂</span><span>Tổng quan</span></Link>
        <Link className={navClass(location.pathname, '/admin/movies')} to="/admin/movies" onClick={closeSidebar}><span>▣</span><span>Phim</span></Link>
        <Link className={navClass(location.pathname, '/admin/cinemas')} to="/admin/cinemas" onClick={closeSidebar}><span>▤</span><span>Rạp & phòng</span></Link>
        <Link className={navClass(location.pathname, '/admin/showtimes')} to="/admin/showtimes" onClick={closeSidebar}><span>◷</span><span>Suất chiếu</span></Link>
      </nav>
      <div className="admin-sidebar-footer">
        <div className="admin-operator"><span className="account-avatar">{user?.fullName.slice(0, 2).toUpperCase()}</span><div><strong>{user?.fullName}</strong><small>Quản trị viên</small></div></div>
        <button className="admin-logout" type="button" disabled={loggingOut} onClick={() => void handleLogout()}><span>↪</span>{loggingOut ? 'Đang thoát…' : 'Đăng xuất'}</button>
        <Link className="admin-back-link" to="/" onClick={closeSidebar}><span>←</span> Trang khách</Link>
      </div>
    </aside>
    <div className="admin-main"><header className="admin-mobile-header"><button className="admin-menu-button" type="button" aria-label="Mở menu quản trị" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>☰</button><Link className="brand" to="/"><span className="brand-mark">▰</span><span>Cine<span>Book</span></span></Link><span>CINEBOOK CONTROL</span></header><main><Outlet /></main></div>
  </div>;
}

export function AuthModal({ mode, onClose }: { mode: 'login' | 'register'; onClose: () => void }) {
  const { login, register } = useAuth();
  const [registerMode, setRegisterMode] = useState(mode === 'register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInput.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setLoading(true);
    try {
      if (registerMode) await register({ fullName, email, password });
      else await login({ email, password });
      onClose();
    } catch (cause) {
      setFormError(errorMessage(cause, 'Không thể xác thực.'));
    } finally {
      setLoading(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="auth-modal" autoComplete="off" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" className="modal-close" aria-label="Đóng" onClick={onClose}>×</button>
      <div className="auth-mark">▰</div><p className="eyebrow">CINEBOOK MEMBER</p><h2 id="auth-title">{registerMode ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h2><p className="auth-copy">Đăng nhập để tiếp tục chọn ghế và quản lý vé điện tử.</p>
      {registerMode && <label>Họ và tên<input ref={firstInput} required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyễn Văn A" autoComplete="name" /></label>}
      <label>Email<input ref={registerMode ? undefined : firstInput} required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete={registerMode ? 'email' : 'off'} /></label>
      <label>Mật khẩu<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu" autoComplete="new-password" /></label>
      {formError && <p className="form-error">{formError}</p>}
      <button className="primary" disabled={loading}>{loading ? 'Đang xử lý…' : registerMode ? 'Đăng ký' : 'Đăng nhập'}</button>
      <button type="button" className="link-button" onClick={() => { setRegisterMode((value) => !value); setFormError(''); }}>{registerMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button>
    </form>
  </div>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1></div>{children}</div>;
}

export function BackLink({ to = '/', children = 'Quay lại' }: { to?: string; children?: ReactNode }) {
  return <Link className="back-link" to={to}>← {children}</Link>;
}

export function UserOnly({ children }: { children: (user: User) => ReactNode }) {
  const { user } = useAuth();
  return user ? children(user) : null;
}
