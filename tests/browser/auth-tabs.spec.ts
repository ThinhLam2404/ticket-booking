import { expect, test } from '@playwright/test';

test.describe('shared browser authentication', () => {
  test.skip(!process.env.PLAYWRIGHT_FULL_STACK, 'Requires isolated full-stack runner');

  test('restores the same session in a new tab, survives reload, and propagates logout', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('browser.customer@example.com');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('Password123!');
    await page.getByRole('dialog').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();

    expect(await page.evaluate(() => document.cookie)).not.toContain('cinebook_refresh');
    expect(await page.evaluate(() => localStorage.getItem('ticket_booking_refresh_token'))).toBeTruthy();

    const other = await context.newPage();
    await other.goto('/bookings');
    await expect(other.getByRole('heading', { name: 'Booking của tôi', exact: true })).toBeVisible();
    await other.reload();
    await expect(other.getByRole('heading', { name: 'Booking của tôi', exact: true })).toBeVisible();

    await Promise.all([page.reload(), other.reload()]);
    await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();
    await expect(other.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(other.getByRole('banner').getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ticket_booking_refresh_token'))).toBeNull();
  });
});
