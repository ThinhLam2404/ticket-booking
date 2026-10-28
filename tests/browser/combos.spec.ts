import { expect, test } from '@playwright/test';

test('admin configures a combo and customer purchases it with immutable tickets @mobile', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Requires isolated API');
  // Keep this journey independent from the preceding invitation tests. The browser
  // runner starts with a fresh database/Redis stack, so no rate-limit sleep is needed.
  test.setTimeout(180000);
  const comboName = `Combo browser ${Date.now()}`;
  const api = process.env.PLAYWRIGHT_API_URL!;
  const login = await request.post(`${api}/auth/login`, { data: { email: 'browser.admin@example.com', password: 'Password123!' } });
  expect(login.ok()).toBe(true);
  const auth = await login.json();
  await page.addInitScript((value) => { localStorage.setItem('ticket_booking_refresh_token', value.refreshToken); localStorage.setItem('ticket_booking_user', JSON.stringify(value.user)); }, auth);
  await page.goto('/admin/combos');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Tên combo', { exact: true }).fill(comboName);
  await page.getByLabel('Thành phần', { exact: true }).fill('Một bắp và hai nước');
  await page.getByLabel('Ảnh (HTTPS)').fill('https://example.com/combo.png');
  await page.getByRole('button', { name: 'Xem lại thay đổi' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu combo');
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).last().click();
  await page.getByLabel('Ảnh (HTTPS)').fill('');
  await page.getByRole('button', { name: 'Xem lại thay đổi' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const catalog = await (await request.get(`${api}/combos/admin`, { headers: { Authorization: `Bearer ${auth.accessToken}` } })).json();
  expect(catalog.find((item: { name: string }) => item.name === comboName).imageUrl).toBeNull();
  await page.screenshot({ path: 'test-results/combo-admin-desktop.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const cinemas = await (await request.get(`${api}/cinemas`)).json();
  await page.getByRole('combobox', { name: 'Rạp chiếu', exact: true }).selectOption(cinemas[0].id);
  await page.getByRole('combobox', { name: 'Combo', exact: true }).selectOption({ label: comboName });
  await page.getByLabel('Giá bán (VND)').fill('99000');
  await page.getByRole('button', { name: 'Xem lại giá bán' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sửa giá bán' }).click();
  await page.getByRole('combobox', { name: 'Rạp chiếu', exact: true }).selectOption('');
  await page.getByRole('combobox', { name: 'Rạp chiếu', exact: true }).selectOption(cinemas[0].id);
  await expect(page.getByRole('combobox', { name: 'Combo', exact: true })).toHaveValue('');
  await expect(page.getByLabel('Giá bán (VND)')).toHaveValue('');
  expect(cinemas.length).toBeGreaterThan(0);
  const customerLogin = await request.post(`${api}/auth/login`, { data: { email: 'browser.customer@example.com', password: 'Password123!' } });
  const customer = await customerLogin.json();
  const context = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript((value) => { localStorage.setItem('ticket_booking_refresh_token', value.refreshToken); localStorage.setItem('ticket_booking_user', JSON.stringify(value.user)); }, customer);
    const shopper = await context.newPage();
    await shopper.goto(`${process.env.PLAYWRIGHT_BASE_URL}/showtimes/browser-showtime/seats`);
    await shopper.getByRole('button', { name: /Ghế A5/ }).click();
    await shopper.getByLabel(`Số lượng ${comboName}`).selectOption('2');
    await shopper.screenshot({ path: 'test-results/combo-customer-mobile.png', fullPage: true });
    let attempt = 0;
    const purchases: Array<{ key: string | undefined; body: string | null }> = [];
    await shopper.route('**/bookings/hold', async (route) => {
      purchases.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      attempt += 1;
      if (attempt === 1) { await route.fetch(); await route.abort('failed'); return; }
      if (attempt === 2) { await route.fulfill({ status: 429, json: { statusCode: 429, message: 'Too many requests' } }); return; }
      await route.continue();
    });
    await shopper.getByRole('button', { name: 'Giữ ghế & Thanh toán' }).click();
    await expect(shopper.getByRole('alert')).toContainText('Chưa xác định');
    await shopper.getByRole('button', { name: 'Giữ ghế & Thanh toán' }).click();
    await expect.poll(() => attempt).toBe(2);
    await expect(shopper.getByLabel(`Số lượng ${comboName}`)).toBeDisabled();
    const hold = shopper.waitForResponse((response) => response.url().endsWith('/bookings/hold') && response.status() < 300);
    await shopper.getByRole('button', { name: 'Giữ ghế & Thanh toán' }).click();
    const booking = await (await hold).json();
    expect(purchases).toHaveLength(3);
    expect(purchases[1]).toEqual(purchases[0]);
    expect(purchases[2]).toEqual(purchases[0]);
    expect(booking.comboSubtotal).toBe('198000.00');
    await expect(shopper.getByRole('region', { name: 'Combo đã mua' })).toContainText(`${comboName} × 2`);
    await expect(shopper.getByLabel(`Số lượng ${comboName}`)).toHaveCount(0);
    expect(await shopper.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await shopper.getByRole('button', { name: 'Thanh toán qua chuyển khoản' }).click();
    const paymentCode = (await shopper.locator('.qr-payment-code').textContent())!.trim();
    const webhook = await request.post(`${api}/payments/sepay/webhook`, { headers: { Authorization: `Apikey ${process.env.PLAYWRIGHT_SEPAY_WEBHOOK_API_KEY}` }, data: { id: Math.floor(Date.now() / 1000), gateway: 'BrowserBank', transactionDate: new Date().toISOString(), accountNumber: 'browser-account', transferType: 'in', transferAmount: Number(booking.totalAmount), content: paymentCode } });
    expect(webhook.ok()).toBe(true);
    await expect.poll(async () => (await (await request.get(`${api}/bookings/${booking.id}`, { headers: { Authorization: `Bearer ${customer.accessToken}` } })).json()).status).toBe('CONFIRMED');
    await expect(shopper).toHaveURL(/\/tickets$/, { timeout: 15000 });
    await shopper.locator(`a[href="/bookings/${booking.id}/tickets"]`).first().click();
    await expect(shopper.getByText('Combo dưới đây thuộc toàn bộ booking', { exact: false })).toBeVisible();
    await expect(shopper.getByRole('region', { name: 'Combo đã mua' })).toContainText(`${comboName} × 2`);
    await expect.poll(async () => {
      const messages = await (await request.get(`${process.env.PLAYWRIGHT_SMTP_API_URL}/api/v1/search`, { params: { query: 'to:browser.customer@example.com' } })).json();
      for (const message of messages.messages ?? []) {
        const detail = await (await request.get(`${process.env.PLAYWRIGHT_SMTP_API_URL}/api/v1/message/${message.ID ?? message.id}`)).json();
        if (String(detail.Text).includes(comboName)) return true;
      }
      return false;
    }, { timeout: 20000 }).toBe(true);
  } finally {
    await context.close().catch(() => undefined);
  }
});
