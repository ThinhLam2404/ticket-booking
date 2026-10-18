import { expect, test } from '@playwright/test';

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
