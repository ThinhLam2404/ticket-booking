import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModal } from './AuthModal';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}));
const api = vi.hoisted(() => ({
  resendVerificationEmail: vi.fn(),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => auth,
}));
vi.mock('../../api', () => ({
  api,
  ApiClientError: class ApiClientError extends Error {},
}));
vi.mock('../../components/useDialogFocus', () => ({
  useDialogFocus: vi.fn(),
}));

describe('AuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows verification state and enforces resend cooldown', async () => {
    vi.useFakeTimers();
    auth.register.mockResolvedValue({ email: 'customer@example.com' });
    api.resendVerificationEmail.mockResolvedValue({ success: true });

    render(<AuthModal mode="register" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Nguyen Van A' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'customer@example.com' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    await act(async () => Promise.resolve());

    expect(screen.getByText(/Liên kết xác thực đã được gửi/)).toBeInTheDocument();
    const resend = screen.getByRole('button', { name: /Gửi lại sau 60s/ });
    expect(resend).toBeDisabled();
    expect(api.resendVerificationEmail).not.toHaveBeenCalled();

    fireEvent.click(resend);
    expect(api.resendVerificationEmail).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('button', { name: 'Gửi lại email xác thực' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác thực' }));
    await act(async () => Promise.resolve());
    expect(api.resendVerificationEmail).toHaveBeenCalledWith('customer@example.com');
    vi.useRealTimers();
  });
});
