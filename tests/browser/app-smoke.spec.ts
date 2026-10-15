import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3301/api/v1';
const smtpApiBase = process.env.PLAYWRIGHT_SMTP_API_URL ?? 'http://127.0.0.1:58025';
const customer = { email: 'browser.customer@example.com', password: 'Password123!' };

async function loginCustomer(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Mật khẩu').fill(customer.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
}

async function waitForMail(request: import('@playwright/test').APIRequestContext, email: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`${smtpApiBase}/api/v1/search`, { params: { query: `to:${email}` } });
    if (response.ok()) {
      const body = await response.json() as { messages?: Array<{ ID?: string; id?: string }> };
      const messageId = body.messages?.[0]?.ID ?? body.messages?.[0]?.id;
      if (messageId) {
        const message = await request.get(`${smtpApiBase}/api/v1/message/${messageId}`);
        if (message.ok()) {
          const detail = await message.json() as { Subject?: string; Text?: string; HTML?: string };
          return detail;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Email was not delivered for ${email}`);
}

async function waitForVerificationUrl(request: import('@playwright/test').APIRequestContext, email: string) {
  const detail = await waitForMail(request, email);
  const source = `${detail.Text ?? ''} ${detail.HTML ?? ''}`;
  const match = source.match(/verify-email\?token=([^&<>"']+)/);
  if (!match?.[1]) throw new Error(`Verification URL was not found in the email for ${email}`);
  return `/verify-email?token=${decodeURIComponent(match[1])}`;
}

test.describe('CineBook browser smoke', () => {
  test('renders the customer catalogue in Vietnamese', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/CineBook|Movie Ticket/i);
    await expect(page.locator('body')).toContainText(/phim|rạp|suất chiếu/i);
  });

  test('protects customer booking routes when signed out', async ({ page }) => {
    await page.goto('/bookings');

    await expect(page).not.toHaveURL(/\/bookings$/);
    await expect(page.locator('body')).toContainText(/đăng nhập|tài khoản/i);
  });

  test('protects admin routes when signed out', async ({ page }) => {
    await page.goto('/admin/bookings');

    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.locator('body')).toContainText(/đăng nhập|quản trị/i);
  });

  test('supports keyboard focus and light/dark theme controls', async ({ page }) => {
    await page.goto('/');

    const theme = page.getByRole('button', { name: /Chuyển sang giao diện/ }).first();
    await expect(theme).toBeVisible();
    await theme.focus();
    await expect(theme).toBeFocused();
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('registers, verifies the email, logs in, and logs out', async ({ page, request }) => {
    test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Full-stack browser suite only');
    const email = `browser-${Date.now()}@example.com`;
    await page.goto('/');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.getByRole('button', { name: 'Chưa có tài khoản? Đăng ký' }).click();
    await page.getByLabel('Họ và tên').fill('Browser Journey Customer');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mật khẩu').fill(customer.password);
    await page.getByRole('button', { name: 'Đăng ký' }).click();
    await expect(page.getByRole('heading', { name: 'Kiểm tra email' })).toBeVisible();
    await page.goto(await waitForVerificationUrl(request, email));
    await expect(page.getByRole('heading', { name: 'Xác thực thành công' })).toBeVisible();
    await page.getByRole('link', { name: 'Về trang chủ' }).click();
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mật khẩu').fill(customer.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  });

  test('holds and cancels a couple seat pair', async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Full-stack browser suite only');
    await loginCustomer(page);
    await page.goto('/showtimes/browser-showtime/seats');
    await page.getByRole('button', { name: /Ghế A9/ }).click();
    await expect(page.locator('.seat.chosen')).toHaveCount(2);
    await page.getByRole('button', { name: 'Giữ ghế & Thanh toán' }).click();
    await expect(page).toHaveURL(/\/bookings\//);
    await expect(page.getByText('Ghế A9')).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Hủy booking' }).click();
    await expect(page).toHaveURL(/\/bookings$/);
  });

  test('checks out, confirms a multi-ticket booking through the SePay webhook, and sees tickets', async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Full-stack browser suite only');
    await loginCustomer(page);
    await page.goto('/showtimes/browser-showtime/seats');
    await page.getByRole('button', { name: /Ghế A3/ }).click();
    await page.getByRole('button', { name: /Ghế A4/ }).click();
    await page.getByRole('button', { name: 'Giữ ghế & Thanh toán' }).click();
    await expect(page).toHaveURL(/\/bookings\/([^/]+)$/);
    const bookingId = page.url().split('/').pop()!;
    await page.getByRole('button', { name: 'Thanh toán qua chuyển khoản' }).click();
    await expect(page.getByRole('heading', { name: 'Quét mã QR để thanh toán' })).toBeVisible();
    const paymentCode = (await page.locator('.qr-payment-code').textContent())?.trim();
    const accessToken = await page.evaluate(() => sessionStorage.getItem('ticket_booking_access_token'));
    const bookingResponse = await page.request.get(`${apiBase}/bookings/${bookingId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const booking = await bookingResponse.json() as { totalAmount: string };
    const webhook = await page.request.post(`${apiBase}/payments/sepay/webhook`, {
      headers: { Authorization: `Apikey ${process.env.PLAYWRIGHT_SEPAY_WEBHOOK_API_KEY}` },
      data: { id: Date.now(), gateway: 'BrowserBank', transactionDate: new Date().toISOString(), accountNumber: 'browser-account', transferType: 'in', transferAmount: Number(booking.totalAmount), content: `Thanh toan ${paymentCode}`, referenceCode: `BROWSER-${bookingId}` },
    });
    expect(webhook.ok()).toBe(true);
    await page.goto('/tickets');
    await expect(page.getByText('Browser Test Movie')).toHaveCount(2);
    const ticketMail = await waitForMail(page.request, customer.email);
    expect(ticketMail.Subject ?? '').toMatch(/vé|ticket/i);
  });

  test('preserves booking pagination state in the URL and API request', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('ticket_booking_access_token', 'browser-test-access');
      sessionStorage.setItem('ticket_booking_refresh_token', 'browser-test-refresh');
      sessionStorage.setItem('ticket_booking_user', JSON.stringify({ id: 'browser-customer', email: 'browser.customer@example.com', fullName: 'Browser Customer', role: 'CUSTOMER' }));
    });
    await page.route('**/api/v1/bookings?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { limit: 20, hasNextPage: false, hasPreviousPage: true, nextCursor: null, previousCursor: 'cursor-test' } }),
    }));
    const requestPromise = page.waitForRequest((request) => request.url().includes('/api/v1/bookings?'));
    await page.goto('/bookings?status=CONFIRMED&after=cursor-test');
    const request = await requestPromise;
    const query = new URL(request.url()).searchParams;
    expect(query.get('status')).toBe('CONFIRMED');
    expect(query.get('after')).toBe('cursor-test');
    await expect(page).toHaveURL(/status=CONFIRMED&after=cursor-test/);
  });

  test('keeps focus inside auth dialog and closes with Escape', async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Đăng nhập' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Chào mừng trở lại' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('reports no critical accessibility violations on the catalogue', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
  });

  test('shows an API error state for an invalid verification token', async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Full-stack browser suite only');
    await page.goto('/verify-email?token=invalid-browser-token');
    await expect(page.getByRole('heading', { name: 'Xác thực chưa hoàn tất' })).toBeVisible();
  });

  test('@mobile keeps the customer shell usable on a narrow viewport', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(false);
  });
});
