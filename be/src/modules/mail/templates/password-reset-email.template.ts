import { emailLayout } from './email-layout.js';
import { escapeHtml, type RenderedEmail } from './email-template.types.js';

export type PasswordResetEmailData = {
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export function renderPasswordResetEmail(data: PasswordResetEmailData): RenderedEmail {
  const fullName = escapeHtml(data.fullName);
  const resetUrl = escapeHtml(data.resetUrl);
  const content = `
    <div style="color:#0b64dd;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">BẢO MẬT TÀI KHOẢN</div>
    <h1 style="margin:12px 0 16px;color:#0e1b35;font-size:30px;line-height:1.1;letter-spacing:-.04em;">Đặt lại mật khẩu CineBook</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Xin chào <strong>${fullName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:8px;background:#0b64dd;"><a href="${resetUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Đặt lại mật khẩu</a></td></tr></table>
    <p style="margin:24px 0 8px;color:#42526a;font-size:13px;line-height:1.6;">Nếu nút không hoạt động, hãy sao chép liên kết sau:</p>
    <p style="margin:0;word-break:break-all;color:#0755bd;font-size:12px;line-height:1.6;">${resetUrl}</p>
    <div style="margin-top:24px;padding:14px 16px;border-radius:8px;background:#eef3f8;color:#42526a;font-size:13px;line-height:1.6;">Liên kết có hiệu lực trong ${data.expiresInMinutes} phút và chỉ sử dụng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.</div>`;
  return {
    subject: 'Đặt lại mật khẩu CineBook',
    text: `Xin chào ${data.fullName},\n\nĐặt lại mật khẩu tại:\n${data.resetUrl}\n\nLiên kết có hiệu lực trong ${data.expiresInMinutes} phút và chỉ dùng một lần.`,
    html: emailLayout({ preheader: 'Liên kết bảo mật để đặt lại mật khẩu CineBook.', content }),
  };
}
