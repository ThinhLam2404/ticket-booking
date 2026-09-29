import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { FormEvent, ReactNode, RefObject } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiClientError } from '../api';
import { useLocationContext } from '../auth/LocationContext';
import type { Province, User } from '../types';
import { errorMessage, statusLabel } from '../utils/format';
import { ThemeSwitch } from './ThemeToggle';

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

function provinceShortName(name?: string) {
  return name?.replace(/^Thành phố /, 'TP. ').replace(/^Tỉnh /, '') ?? 'Đang chọn';
}

export function useDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>, onClose: () => void, initialFocusRef?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusInitial = initialFocusRef?.current ?? dialog?.querySelector<HTMLElement>(focusableSelector);
    focusInitial?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => !element.hasAttribute('aria-hidden'));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [dialogRef, initialFocusRef, open]);
}

export function LocationPicker({ className = '' }: { className?: string }) {
  const { provinces, selectedProvince, selectedProvinceCode, setSelectedProvinceCode, isPending, isError, error, refetch } = useLocationContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const normalizeSearch = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
  const normalizedSearch = normalizeSearch(search);
  const filteredProvinces = provinces.filter((province: Province) => {
    const haystack = `${normalizeSearch(province.name)} ${normalizeSearch(province.codename)}`;
    return haystack.includes(normalizedSearch);
  });
  function closePicker() {
    setSearch('');
    setOpen(false);
  }
  useDialogFocus(open, dialogRef, closePicker, searchInput);

  function chooseProvince(code: number) {
    setSelectedProvinceCode(code);
    closePicker();
  }

  const picker = open ? <div className="location-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
    <section ref={dialogRef} className="location-picker" role="dialog" aria-modal="true" aria-labelledby="location-picker-title" tabIndex={-1}>
      <button className="modal-close" type="button" aria-label="Đóng chọn tỉnh thành" onClick={closePicker}>×</button>
      <p className="eyebrow">KHU VỰC CINEBOOK</p>
      <h2 id="location-picker-title">Bạn muốn xem phim ở đâu?</h2>
      <p className="location-picker-copy">Chọn tỉnh/thành để lọc rạp và suất chiếu gần bạn.</p>
      <label className="location-search"><span className="sr-only">Tìm tỉnh thành</span><span aria-hidden="true">⌕</span><input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tỉnh hoặc thành phố…" /></label>
      {isPending && <LoadingState label="Đang tải danh sách tỉnh thành…" />}
      {isError && <ErrorState cause={error} fallback="Không thể tải danh sách tỉnh thành." onRetry={refetch} />}
      {!isPending && !isError && !filteredProvinces.length && <EmptyState>Không tìm thấy tỉnh/thành phù hợp.</EmptyState>}
      {!isPending && !isError && filteredProvinces.length > 0 && <div className="province-list" role="listbox" aria-label="Danh sách tỉnh thành">
        {filteredProvinces.map((province) => <button className={`province-option${province.code === selectedProvinceCode ? ' active' : ''}`} type="button" role="option" aria-selected={province.code === selectedProvinceCode} key={province.code} onClick={() => chooseProvince(province.code)}><span><strong>{province.name}</strong><small>{province.code === selectedProvinceCode ? 'Khu vực đang chọn' : 'Lọc rạp và suất chiếu'}</small></span>{province.code === selectedProvinceCode && <b aria-hidden="true">✓</b>}</button>)}
      </div>}
      <div className="location-picker-footer"><span>Đã chọn: <strong>{selectedProvince?.name ?? 'TP. Hồ Chí Minh'}</strong></span><button className="secondary compact-button" type="button" onClick={closePicker}>Đóng</button></div>
    </section>
  </div> : null;

  return <>
    <button className={`location-pill ${className}`} type="button" aria-expanded={open} onClick={() => setOpen(true)}>
      <span aria-hidden="true">⌖</span><span>{provinceShortName(selectedProvince?.name)}</span><span className="location-chevron" aria-hidden="true" />
    </button>
    {picker && createPortal(picker, document.body)}
  </>;
}

export function TrailerModal({ movieTitle, trailerKey, onClose }: { movieTitle: string; trailerKey: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useDialogFocus(true, dialogRef, onClose);

  useEffect(() => {
    setFrameState('loading');
    const timeout = window.setTimeout(() => setFrameState((state) => state === 'loading' ? 'error' : state), 10000);
    return () => window.clearTimeout(timeout);
  }, [attempt, trailerKey]);

  const directUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(trailerKey)}`;

  return createPortal(<div className="trailer-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="trailer-modal" role="dialog" aria-modal="true" aria-labelledby="trailer-modal-title" tabIndex={-1}>
      <div className="trailer-modal-heading"><div><p className="eyebrow">TRAILER CHÍNH THỨC</p><h2 id="trailer-modal-title">{movieTitle}</h2></div><button className="modal-close" type="button" aria-label="Đóng trailer" onClick={onClose}>×</button></div>
      <div className={`trailer-frame trailer-frame-${frameState}`}>
        {frameState === 'loading' && <div className="trailer-frame-state" role="status"><span className="spinner" />Đang tải trailer…</div>}
        {frameState === 'error' && <div className="trailer-frame-state trailer-frame-error" role="alert"><strong>Không thể phát trailer trong cửa sổ này.</strong><span>Thử lại hoặc mở trực tiếp trên YouTube.</span><button className="secondary compact-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button></div>}
        <iframe key={attempt} title={`Trailer ${movieTitle}`} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerKey)}?autoplay=1&rel=0`} onLoad={() => setFrameState('ready')} onError={() => setFrameState('error')} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
      <div className="trailer-modal-footer"><span>Nhấn ESC hoặc chọn đóng để quay lại trang phim.</span><div className="trailer-modal-actions"><a className="secondary compact-button" href={directUrl} target="_blank" rel="noopener noreferrer">Mở trên YouTube</a><button className="secondary compact-button" type="button" onClick={onClose}>Đóng</button></div></div>
    </section>
  </div>, document.body);
}

export function Alert({ type, children, onClose }: { type: 'success' | 'error'; children: ReactNode; onClose?: () => void }) {
  return <div className={`alert ${type}`} role={type === 'error' ? 'alert' : 'status'}><span>{children}</span>{onClose && <button aria-label="Đóng thông báo" onClick={onClose}>×</button>}</div>;
}

export function NoticeDialog({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, onClose);

  return createPortal(<div className="modal-backdrop notice-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="notice-dialog" role="alertdialog" aria-modal="true" aria-labelledby="notice-dialog-title" tabIndex={-1}>
      <span className="notice-dialog-icon" aria-hidden="true">!</span>
      <div><p className="eyebrow">CẬP NHẬT SƠ ĐỒ GHẾ</p><h2 id="notice-dialog-title">{title}</h2><p>{message}</p></div>
      <button className="primary" type="button" onClick={onClose}>Chọn ghế khác</button>
    </div>
  </div>, document.body);
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
          <LocationPicker />
          <span className="customer-header-theme"><ThemeSwitch compact /></span>
          <Link className="search-button" aria-label="Tìm kiếm phim" to="/#now-showing">⌕</Link>
          {user ? <div className="account-menu"><span className="account-avatar">{user.fullName.slice(0, 2).toUpperCase()}</span><span className="account-name">{user.fullName}</span><button className="ghost" disabled={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? 'Đang thoát…' : 'Đăng xuất'}</button></div> : <button className="primary login-button" onClick={() => openAuth()}>Đăng nhập</button>}
        </div>
      </div>
    </header>
    <main><Outlet /></main>
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand"><Link className="brand" to="/"><span className="brand-mark">▰</span><span>Cine<span>Book</span></span></Link><p>Hệ thống đặt vé xem phim trực tuyến hiện đại. Chọn suất chiếu, giữ ghế và bước vào thế giới điện ảnh.</p><strong>Hotline hỗ trợ: 1900 6868</strong></div>
         <div><h3>Về CineBook</h3><Link to="/cinemas">Cụm rạp toàn quốc</Link><Link to="/#now-showing">Phim đang chiếu</Link><a href="tel:19006868">Liên hệ hỗ trợ</a></div>
         <div><h3>Chính sách</h3><span className="footer-link">Chính sách thanh toán</span><span className="footer-link">Điều khoản sử dụng</span><span className="footer-link">Bảo mật thông tin</span></div>
        <div><h3>Đối tác</h3><div className="partner-list"><span>IMAX</span><span>Dolby</span><span>MoMo</span><span>VNPAY</span><span>Visa</span><span>ZaloPay</span></div></div>
      </div>
      <div className="footer-bottom"><span>© 2026 CineBook Vietnam. All rights reserved.</span><span>Trải nghiệm điện ảnh trong tầm tay.</span></div><p className="tmdb-footer-attribution">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </footer>
    <nav className="mobile-nav" aria-label="Điều hướng di động"><Link className={navClass(location.pathname, '/')} to="/"><span>⌂</span><small>Trang chủ</small></Link><Link className={navClass(location.pathname, '/#now-showing')} to="/#now-showing"><span>▣</span><small>Phim</small></Link><Link className={navClass(location.pathname, '/cinemas')} to="/cinemas"><span>▤</span><small>Rạp chiếu</small></Link>{user ? <Link className={navClass(location.pathname, '/tickets')} to="/tickets"><span>▱</span><small>Vé của tôi</small></Link> : <button onClick={() => openAuth()}><span>◉</span><small>Tài khoản</small></button>}<ThemeSwitch compact /></nav>
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
        <Link className={navClass(location.pathname, '/admin/payments')} to="/admin/payments" onClick={closeSidebar}><span>💳</span><span>Thanh toán</span></Link>
      </nav>
       <div className="admin-sidebar-footer">
         <ThemeSwitch />

        <div className="admin-operator"><span className="account-avatar">{user?.fullName.slice(0, 2).toUpperCase()}</span><div><strong>{user?.fullName}</strong><small>Quản trị viên</small></div></div>
        <button className="admin-logout" type="button" disabled={loggingOut} onClick={() => void handleLogout()}><span>↪</span>{loggingOut ? 'Đang thoát…' : 'Đăng xuất'}</button>
        <Link className="admin-back-link" to="/" onClick={closeSidebar}><span>←</span> Trang khách</Link>
      </div>
    </aside>
    <div className="admin-main"><header className="admin-mobile-header"><ThemeSwitch compact /><button className="admin-menu-button" type="button" aria-label="Mở menu quản trị" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>☰</button><Link className="brand" to="/"><span className="brand-mark">▰</span><span>Cine<span>Book</span></span></Link><span>CINEBOOK CONTROL</span></header><main><Outlet /></main></div>
  </div>;
}

export function AuthModal({ mode, onClose }: { mode: 'login' | 'register'; onClose: () => void }) {
  const { login, register } = useAuth();
  const [registerMode, setRegisterMode] = useState(mode === 'register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  useDialogFocus(true, dialogRef, onClose, firstInput);

  useEffect(() => {
    if (!resendCooldown) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function resendVerification(emailAddress: string) {
    if (resendCooldown > 0) return;
    setResendState('loading');
    setResendMessage('');
    try {
      await api.resendVerificationEmail(emailAddress);
      setResendState('success');
      setResendMessage('Email xác thực mới đã được gửi, vui lòng kiểm tra email');
      setResendCooldown(60);
    } catch (cause) {
      setResendState('error');
      setResendMessage(errorMessage(cause, 'Không thể gửi lại email xác thực.'));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setResendState('idle');
    setResendMessage('');
    setLoading(true);
    try {
      if (registerMode) {
        const response = await register({ fullName, email, password });
        setVerificationEmail(response.email);
        setResendCooldown(60);
      } else {
        await login({ email, password });
        onClose();
      }
    } catch (cause) {
      setFormError(errorMessage(cause, 'Không thể xác thực.'));
      if (cause instanceof ApiClientError && cause.code === 'AUTH_EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email.trim());
      } else {
        setUnverifiedEmail('');
      }
    } finally {
      setLoading(false);
    }
  }

  const resendMessageClass = resendState === 'success' ? 'alert success' : 'form-error';

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={dialogRef} className="auth-modal" autoComplete="off" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="auth-title" tabIndex={-1}>
      <button type="button" className="modal-close" aria-label="Đóng" onClick={onClose}>×</button>
      <div className="auth-mark">▰</div><p className="eyebrow">CINEBOOK MEMBER</p><h2 id="auth-title">{verificationEmail ? 'Kiểm tra email' : registerMode ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h2>
      {verificationEmail ? <>
        <p className="auth-copy">Liên kết xác thực đã được gửi tới <strong>{verificationEmail}</strong>. Mở email để kích hoạt tài khoản trước khi đăng nhập.</p>
        <button type="button" className="primary" onClick={onClose}>Đã hiểu</button>
        <button type="button" className="link-button" disabled={resendState === 'loading' || resendCooldown > 0} onClick={() => void resendVerification(verificationEmail)}>{resendState === 'loading' ? 'Đang gửi…' : resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại email xác thực'}</button>
        {resendMessage && <p className={resendMessageClass} aria-live="polite">{resendMessage}</p>}
      </> : <>
        <p className="auth-copy">Đăng nhập để tiếp tục chọn ghế và quản lý vé điện tử.</p>
        {registerMode && <label>Họ và tên<input ref={firstInput} required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyễn Văn A" autoComplete="name" /></label>}
        <label>Email<input ref={registerMode ? undefined : firstInput} required type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (unverifiedEmail) setUnverifiedEmail(''); }} placeholder="Email" autoComplete={registerMode ? 'email' : 'off'} /></label>
        <label>Mật khẩu<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu" autoComplete="new-password" /></label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {unverifiedEmail && !registerMode && <div className="verification-resend" aria-live="polite"><p className="form-hint">Bạn cần xác thực email trước khi đăng nhập.</p><button type="button" className="link-button" disabled={resendState === 'loading' || resendCooldown > 0} onClick={() => void resendVerification(unverifiedEmail)}>{resendState === 'loading' ? 'Đang gửi…' : resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại email xác thực'}</button>{resendMessage && <p className={resendMessageClass}>{resendMessage}</p>}</div>}
        <button className="primary" disabled={loading}>{loading ? 'Đang xử lý…' : registerMode ? 'Đăng ký' : 'Đăng nhập'}</button>
        <button type="button" className="link-button" onClick={() => { setRegisterMode((value) => !value); setFormError(''); setUnverifiedEmail(''); setResendState('idle'); setResendMessage(''); setResendCooldown(0); }}>{registerMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button>
      </>}
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
