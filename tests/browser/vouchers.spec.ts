import { expect, test } from '@playwright/test';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: unknown;
};

function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function setSession(page: import('@playwright/test').Page, auth: AuthResponse) {
  await page.addInitScript((value) => {
    localStorage.setItem('ticket_booking_refresh_token', value.refreshToken);
    localStorage.setItem('ticket_booking_user', JSON.stringify(value.user));
  }, auth);
}

test('admin issues a voucher and customer completes a checkout without stale quote data', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Requires isolated full-stack runner');
  test.setTimeout(120000);

  const api = process.env.PLAYWRIGHT_API_URL!;
  const password = 'Password123!';
  const code = `BROWSER${Date.now().toString().slice(-8)}`;
  const startsAt = localDateTime(new Date(Date.now() - 60 * 60 * 1000));
  const endsAt = localDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const adminLogin = await request.post(`${api}/auth/login`, {
    headers: { 'X-Forwarded-For': '10.0.0.101' },
    data: { email: 'browser.admin@example.com', password },
  });
  expect(adminLogin.status()).toBe(200);
  const admin = (await adminLogin.json()) as AuthResponse;

  await setSession(page, admin);
  await page.goto('/admin/vouchers');
  await expect(page.getByRole('heading', { name: 'Quản lý voucher' })).toBeVisible();
  await page.getByLabel('Mã voucher').fill(code);
  await page.getByLabel('Loại giảm').selectOption('PERCENT');
  await page.getByLabel('Phạm vi').selectOption('ORDER');
  await page.getByLabel('Giá trị').fill('10');
  await page.getByLabel('Đơn tối thiểu').fill('0');
  await page.getByLabel('Bắt đầu').fill(startsAt);
  await page.getByLabel('Kết thúc').fill(endsAt);
  await page.getByRole('button', { name: 'Xem lại thay đổi' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByText(code, { exact: true })).toBeVisible();

  const assignResponse = page.waitForResponse((response) =>
    response.url().endsWith('/vouchers/admin/' + response.url().split('/').at(-2) + '/assign') &&
    response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Phát cho mọi khách' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  expect((await assignResponse).status()).toBe(201);

  const customerLogin = await request.post(`${api}/auth/login`, {
    headers: { 'X-Forwarded-For': '10.0.0.102' },
    data: { email: 'browser.customer@example.com', password },
  });
  expect(customerLogin.status()).toBe(200);
  const customer = (await customerLogin.json()) as AuthResponse;
  const customerHeaders = { Authorization: `Bearer ${customer.accessToken}` };
  const shopper = await page.context().browser()!.newPage();
  await setSession(shopper, customer);

  try {
    await shopper.goto('/showtimes/browser-showtime/seats');
    await shopper.getByRole('button', { name: 'Ghế A1, Còn trống' }).click();
    await shopper.getByLabel('Mã voucher').fill(code);
    await shopper.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(shopper.getByRole('status')).toContainText(`Đã áp dụng ${code}`);
    await expect(shopper.locator('.summary-voucher')).toContainText(code);

    let releaseQuote!: () => void;
    let signalQuoteStarted!: () => void;
    const quoteStarted = new Promise<void>((resolve) => { signalQuoteStarted = resolve; });
    const quoteReleased = new Promise<void>((resolve) => { releaseQuote = resolve; });
    await shopper.route('**/bookings/quote', async (route) => {
      const response = await route.fetch();
      signalQuoteStarted();
      await quoteReleased;
      await route.fulfill({ response });
    });

    await shopper.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await quoteStarted;
    await shopper.getByRole('button', { name: 'Ghế A2, Còn trống' }).click();
    releaseQuote();
    await expect(shopper.getByRole('status', { name: new RegExp(`Đã áp dụng ${code}`) })).toHaveCount(0);
    await expect(shopper.locator('.summary-voucher')).toHaveCount(0);
    await shopper.unroute('**/bookings/quote');

    await shopper.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(shopper.getByRole('status')).toContainText(`Đã áp dụng ${code}`);
    const holdResponse = shopper.waitForResponse((response) =>
      response.url().endsWith('/bookings/hold') && response.status() < 300,
    );
    await shopper.getByRole('button', { name: 'Giữ ghế & Thanh toán' }).click();
    const booking = await (await holdResponse).json() as { id: string; totalAmount: string; voucherCode: string | null };
    expect(booking.voucherCode).toBe(code);

    const bookingBeforeCheckout = await (await request.get(`${api}/bookings/${booking.id}`, { headers: customerHeaders })).json();
    expect(bookingBeforeCheckout.voucherCode).toBe(code);
    await expect(shopper).toHaveURL(new RegExp(`/bookings/${booking.id}$`));
    await shopper.getByRole('button', { name: 'Thanh toán qua chuyển khoản' }).click();
    const paymentCode = (await shopper.locator('.qr-payment-code').textContent())!.trim();
    const checkoutAmount = Number((await shopper.locator('.qr-info-row').filter({ hasText: 'Số tiền' }).locator('strong').textContent())!.replace(/[^0-9]/g, ''));
    const webhook = await request.post(`${api}/payments/sepay/webhook`, {
      headers: { Authorization: `Apikey ${process.env.PLAYWRIGHT_SEPAY_WEBHOOK_API_KEY}` },
      data: {
        id: Math.floor(Date.now() / 1000),
        gateway: 'BrowserBank',
        transactionDate: new Date().toISOString(),
        accountNumber: 'browser-account',
        transferType: 'in',
        transferAmount: checkoutAmount,
        content: paymentCode,
      },
    });
    expect(webhook.ok()).toBe(true);
    await expect.poll(async () => {
      const response = await request.get(`${api}/bookings/${booking.id}`, { headers: customerHeaders });
      return (await response.json()).status;
    }).toBe('CONFIRMED');
  } finally {
    await shopper.close();
  }
});
