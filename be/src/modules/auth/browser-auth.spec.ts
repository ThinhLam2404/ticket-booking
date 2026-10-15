import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('authentication transport', () => {
  const auth = { login: vi.fn(), refresh: vi.fn(), logout: vi.fn() };
  const controller = new AuthController(auth as unknown as AuthService);

  beforeEach(() => vi.clearAllMocks());

  it('keeps the legacy JSON login and refresh contract', async () => {
    auth.login.mockResolvedValue({
      user: { id: 'user' },
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    auth.refresh.mockResolvedValue({
      user: { id: 'user' },
      accessToken: 'next-access',
      refreshToken: 'next-refresh',
    });

    await expect(controller.login({ email: 'customer@example.com', password: 'Password123!' })).resolves.toEqual({
      user: { id: 'user' },
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    await expect(controller.refresh({ refreshToken: 'refresh' })).resolves.toEqual({
      user: { id: 'user' },
      accessToken: 'next-access',
      refreshToken: 'next-refresh',
    });
    expect(auth.login).toHaveBeenCalledWith({ email: 'customer@example.com', password: 'Password123!' });
    expect(auth.refresh).toHaveBeenCalledWith({ refreshToken: 'refresh' });
  });

  it('passes the JSON refresh token to logout', async () => {
    await controller.logout({ refreshToken: 'refresh' });
    expect(auth.logout).toHaveBeenCalledWith('refresh');
  });
});
