import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ThemeSwitch } from "../../components/ThemeToggle";
import { errorMessage } from "../../utils/format";

export function AdminLoginPage() {
  const { user, loginAsAdmin } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const destination =
    (location.state as { from?: string } | null)?.from ?? "/admin";

  if (user?.role === "ADMIN") return <Navigate to={destination} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      await loginAsAdmin({ email, password });
    } catch (cause) {
      setFormError(
        errorMessage(
          cause,
          "Thông tin xác thực không chính xác hoặc tài khoản chưa được cấp quyền quản trị.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-theme"><ThemeSwitch /></div>
      <div className="admin-login-brand">
        <Link className="brand" to="/">
          <span className="brand-mark">▰</span>
          <span>
            Cine<span>Book</span>
          </span>
        </Link>
        <p className="eyebrow">CINEBOOK CONTROL</p>
        <h1>
          Không gian vận hành
          <br />
          cho rạp chiếu.
        </h1>
        <p>
          Dành riêng cho ban điều hành cụm rạp, quản lý phòng chiếu và bộ phận
          vận hành vé.
        </p>
        <div className="admin-security">
          <span>◈</span>
          <div>
            <strong>Truy cập được bảo vệ</strong>
            <small>Phân quyền quản trị RBAC · SSL 256-bit</small>
          </div>
        </div>
      </div>
      <form
        className="admin-login-card"
        autoComplete="off"
        onSubmit={(event) => void submit(event)}
      >
        <p className="eyebrow">XÁC THỰC QUẢN TRỊ</p>
        <h2>Đăng nhập quản trị</h2>
        <p className="admin-login-copy">
          Nhập thông tin tài khoản được phân quyền bởi CineBook.
        </p>
        <label>
          Email quản trị viên
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@cinebook.vn"
            autoComplete="off"
          />
        </label>
        <label>
          Mật khẩu
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mật khẩu"
            autoComplete="new-password"
          />
        </label>
        <div className="admin-login-options">
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />{" "}
            Ghi nhớ phiên
          </label>
          <span className="admin-muted-link">Quên mật khẩu?</span>
        </div>
        {formError && (
          <p className="admin-login-error" role="alert">
            {formError}
          </p>
        )}
        <button className="primary admin-login-submit" disabled={loading}>
          {loading ? "Đang xác thực…" : "Đăng nhập hệ thống"}
        </button>
        <Link className="admin-back-link" to="/">
          <span>←</span> Quay lại trang khách
        </Link>
      </form>
    </div>
  );
}
