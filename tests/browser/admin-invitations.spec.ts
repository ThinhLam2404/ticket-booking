import { expect, test, type APIRequestContext } from '@playwright/test';

async function invitationMail(request: APIRequestContext, email: string, excludeId = '') {
  const smtp = process.env.PLAYWRIGHT_SMTP_API_URL!;
  let messageId = '';
  await expect.poll(async () => {
    const response = await request.get(`${smtp}/api/v1/search`, { params: { query: `to:${email}` } });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    messageId = (body.messages ?? []).map((message: { ID?: string; id?: string }) => message.ID ?? message.id ?? '').find((id: string) => id && id !== excludeId) ?? '';
    return messageId;
  }, { timeout: 20000 }).not.toBe('');
  const response = await request.get(`${smtp}/api/v1/message/${messageId}`);
  expect(response.ok()).toBe(true);
  const mail = await response.json();
  const match = String(mail.Text).match(/https?:\/\/[^\s]+\/admin\/accept-invitation\?token=[a-f0-9]{64}/);
  expect(match).not.toBeNull();
  const url = match![0];
  expect(new URL(url).origin).toBe(new URL(process.env.PLAYWRIGHT_BASE_URL!).origin);
  return { id: messageId, url, token: new URL(url).searchParams.get('token')! };
}

test('resends through real email, invalidates old token and accepts replacement', async ({ page, request, browser }) => {
  test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Requires isolated full-stack runner');
  test.setTimeout(180000);
  const api = process.env.PLAYWRIGHT_API_URL!;
  const email = `resend-${Date.now()}@example.com`;
  const password = 'Password123!';
  const login = await request.post(`${api}/auth/login`, { data: { email: 'browser.admin@example.com', password } });
  expect(login.status()).toBe(200);
  const auth = await login.json();
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const response = await request.post(`${api}/users/admin/invitations`, { headers, data: { email, permissions: ['VIEW_SYSTEM'] } });
  expect(response.status()).toBe(201);
  const invitation = await response.json();
  const first = await invitationMail(request, email);
  await page.addInitScript((value) => {
    localStorage.setItem('ticket_booking_refresh_token', value.refreshToken);
    localStorage.setItem('ticket_booking_user', JSON.stringify(value.user));
  }, auth);
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Xem lời mời', exact: true }).click();
  const row = page.getByRole('article', { name: `Lời mời ${email}`, exact: true });
  await expect(row).toBeVisible();
  // Exercise the production cooldown without changing the DB, server clock or API responses.
  await expect.poll(() => Date.now() - new Date(invitation.createdAt).getTime(), { timeout: 70000, intervals: [1000] }).toBeGreaterThan(61000);
  await row.getByRole('button', { name: 'Gửi lại', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  const resendResponse = page.waitForResponse((result) => result.url().endsWith(`/users/admin/invitations/${invitation.id}/resend`) && result.request().method() === 'POST');
  await confirm.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  expect((await resendResponse).status()).toBe(201);
  await expect(confirm).toHaveCount(0);
  const second = await invitationMail(request, email, first.id);
  expect(second.token).not.toBe(first.token);
  const recipient = await browser.newContext();
  try {
    const accepted = await recipient.newPage();
    await accepted.goto(first.url);
    await expect(accepted.getByRole('heading', { name: 'Không thể tiếp tục' })).toBeVisible();
    expect((await request.post(`${api}/auth/admin-invitations/accept`, { data: { token: first.token, email, fullName: 'Resend Admin', password } })).status()).toBe(401);
    await accepted.goto(second.url);
    await expect(accepted.getByRole('heading', { name: 'Hoàn tất tài khoản' })).toBeVisible();
    await accepted.getByLabel('Họ và tên').fill('Resend Admin');
    await accepted.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await accepted.getByLabel('Nhập lại mật khẩu').fill(password);
    await accepted.getByRole('button', { name: 'Tạo tài khoản quản trị' }).click();
    await expect(accepted.getByRole('heading', { name: 'Đã tạo tài khoản' })).toBeVisible();
    expect((await request.post(`${api}/auth/login`, { data: { email, password } })).status()).toBe(200);
    expect((await request.post(`${api}/auth/admin-invitations/preview`, { data: { token: second.token } })).status()).toBe(401);
    await expect(row).toContainText('Đã chấp nhận', { timeout: 15000 });
  } finally { await recipient.close(); }
  // Public preview/accept share a production IP limit with subsequent tests.
  // Allow that window to expire rather than weakening the application guard.
  const publicRequestsFinishedAt = Date.now();
  await expect.poll(() => Date.now() - publicRequestsFinishedAt, { timeout: 70000, intervals: [1000] }).toBeGreaterThan(61000);
});

test('invitation list, keyboard focus, resend errors and revoke confirmation @mobile', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Requires isolated full-stack runner');
  const api = process.env.PLAYWRIGHT_API_URL!;
  const login = await request.post(`${api}/auth/login`, { data: { email: 'browser.admin@example.com', password: 'Password123!' } });
  const auth = await login.json();
  const email = `actions-${Date.now()}@example.com`;
  const created = await request.post(`${api}/users/admin/invitations`, { headers: { Authorization: `Bearer ${auth.accessToken}` }, data: { email, permissions: ['VIEW_SYSTEM'] } });
  expect(created.status()).toBe(201);
  const invitation = await created.json();
  await page.addInitScript((value) => { localStorage.setItem('ticket_booking_refresh_token', value.refreshToken); localStorage.setItem('ticket_booking_user', JSON.stringify(value.user)); }, auth);
  await page.goto('/admin/users');
  const opener = page.getByRole('button', { name: 'Mời quản trị viên', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: 'Đóng', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.route('**/users/admin/invitations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 500, json: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Test failure' } });
  });
  await opener.click();
  await dialog.getByLabel('Email', { exact: true }).fill('error@example.com');
  await dialog.getByLabel('Xem hệ thống', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Xem lại lời mời' }).click();
  await dialog.getByRole('button', { name: 'Xác nhận và gửi' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Xác nhận lời mời' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.unroute('**/users/admin/invitations');
  await page.getByRole('button', { name: 'Xem lời mời', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole('article', { name: `Lời mời ${email}`, exact: true });
  await expect(row).toContainText('browser.admin@example.com');
  await expect(row).toContainText('Email:');
  await row.getByRole('button', { name: 'Gửi lại' }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(confirm).toContainText('Dữ liệu đang có xung đột. Vui lòng kiểm tra lại.');
  await confirm.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.route(`**/users/admin/invitations/${invitation.id}/resend`, (route) => route.fulfill({ status: 201, json: invitation }));
  await row.getByRole('button', { name: 'Gửi lại' }).click();
  await confirm.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await row.getByRole('button', { name: 'Thu hồi', exact: true }).click();
  await confirm.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(row).toContainText('Chờ chấp nhận');
  await row.getByRole('button', { name: 'Thu hồi', exact: true }).click();
  await confirm.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(row).toContainText('Đã thu hồi');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('invalid invitation shows a recoverable navigation action', async ({ page }) => {
  await page.goto('/admin/accept-invitation');
  await expect(page.getByRole('heading', { name: 'Không thể tiếp tục' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đến trang đăng nhập' })).toHaveAttribute('href', '/admin/login');
});

test('revoked email link cannot preview or create an admin account', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Requires isolated full-stack runner');
  const api = process.env.PLAYWRIGHT_API_URL!;
  const email = `revoked-${Date.now()}@example.com`;
  const login = await request.post(`${api}/auth/login`, { data: { email: 'browser.admin@example.com', password: 'Password123!' } });
  expect(login.status()).toBe(200);
  const auth = await login.json();
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const created = await request.post(`${api}/users/admin/invitations`, { headers, data: { email, permissions: ['VIEW_SYSTEM'] } });
  expect(created.status()).toBe(201);
  const invitation = await created.json();
  const mail = await invitationMail(request, email);
  expect((await request.post(`${api}/users/admin/invitations/${invitation.id}/revoke`, { headers })).status()).toBe(201);
  await page.goto(mail.url);
  await expect(page.getByRole('heading', { name: 'Không thể tiếp tục' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đến trang đăng nhập' })).toBeVisible();
  expect((await request.post(`${api}/auth/admin-invitations/accept`, { data: { token: mail.token, email, fullName: 'Revoked Admin', password: 'Password123!' } })).status()).toBe(401);
  expect((await request.post(`${api}/auth/login`, { data: { email, password: 'Password123!' } })).status()).toBe(401);
});

test('invites admin through Mailpit, accepts, logs in and enforces permissions', async ({ page, request, browser }) => {
  test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Requires isolated full-stack runner');
  test.setTimeout(60000);
  const email = `invited-${Date.now()}@example.com`;
  const password = 'Password123!';
  const api = process.env.PLAYWRIGHT_API_URL!;
  const smtp = process.env.PLAYWRIGHT_SMTP_API_URL!;
  await page.goto('/admin/login');
  await page.getByLabel('Email quản trị viên').fill('browser.admin@example.com');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập hệ thống', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Mời quản trị viên', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByLabel('Xem hệ thống', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Xem lại lời mời' }).click();
  await dialog.getByRole('button', { name: 'Xác nhận và gửi' }).click();
  await expect(dialog).toHaveCount(0);
  let messageId = '';
  await expect.poll(async () => {
    const response = await request.get(`${smtp}/api/v1/search`, { params: { query: `to:${email}` } });
    const body = await response.json();
    messageId = body.messages?.[0]?.ID ?? body.messages?.[0]?.id ?? '';
    return messageId;
  }, { timeout: 20000 }).not.toBe('');
  const mail = await (await request.get(`${smtp}/api/v1/message/${messageId}`)).json();
  const match = String(mail.Text).match(/https?:\/\/[^\s]+\/admin\/accept-invitation\?token=[a-f0-9]{64}/);
  expect(match).not.toBeNull();
  const invitationUrl = match![0];
  expect(new URL(invitationUrl).origin).toBe(new URL(process.env.PLAYWRIGHT_BASE_URL!).origin);
  const recipient = await browser.newContext();
  try {
    const accepted = await recipient.newPage();
    await accepted.goto(invitationUrl);
    await expect(accepted.getByRole('heading', { name: 'Hoàn tất tài khoản' })).toBeVisible();
    await accepted.getByLabel('Họ và tên').fill('Invited Browser Admin');
    await accepted.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await accepted.getByLabel('Nhập lại mật khẩu').fill(password);
    await accepted.getByRole('button', { name: 'Tạo tài khoản quản trị' }).click();
    await expect(accepted.getByRole('heading', { name: 'Đã tạo tài khoản' })).toBeVisible();
    await accepted.getByRole('link', { name: 'Đăng nhập quản trị' }).click();
    await accepted.getByLabel('Email quản trị viên').fill(email);
    await accepted.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await accepted.getByRole('button', { name: 'Đăng nhập hệ thống', exact: true }).click();
    await expect(accepted).toHaveURL(/\/admin$/);
    const login = await request.post(`${api}/auth/login`, { data: { email, password } });
    expect(login.status()).toBe(200);
    const { accessToken } = await login.json();
    const headers = { Authorization: `Bearer ${accessToken}` };
    expect((await request.get(`${api}/admin/operations/status`, { headers })).status()).toBe(200);
    expect((await request.get(`${api}/users/admin`, { headers })).status()).toBe(403);
    const reused = await request.post(`${api}/auth/admin-invitations/preview`, { data: { token: new URL(invitationUrl).searchParams.get('token') } });
    expect(reused.status()).toBe(401);
  } finally { await recipient.close(); }
});
