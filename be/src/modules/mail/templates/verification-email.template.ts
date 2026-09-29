import { emailLayout } from './email-layout.js';
import { escapeHtml, type RenderedEmail } from './email-template.types.js';

export type VerificationEmailData = {
  fullName: string;
  verificationUrl: string;
  expiresInHours: number;
};

export function renderVerificationEmail(data: VerificationEmailData): RenderedEmail {
  const fullName = escapeHtml(data.fullName);
  const verificationUrl = escapeHtml(data.verificationUrl);
  const content = `
    <div style="color:#0b64dd;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">XÁC THỰC TÀI KHOẢN</div>
    <h1 style="margin:12px 0 16px;color:#0e1b35;font-size:30px;line-height:1.1;letter-spacing:-.04em;">Chào mừng bạn đến với CineBook</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Xin chào <strong>${fullName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Hãy xác thực email để hoàn tất tài khoản và bắt đầu chọn phim, giữ ghế và nhận vé điện tử từ CineBook.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="border-radius:8px;background:#0b64dd;">
          <a href="${verificationUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Xác thực tài khoản</a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 8px;color:#42526a;font-size:13px;line-height:1.6;">Nếu nút không hoạt động, hãy sao chép liên kết sau vào trình duyệt:</p>
    <p style="margin:0;word-break:break-all;color:#0755bd;font-size:12px;line-height:1.6;">${verificationUrl}</p>
    <div style="margin-top:24px;padding:14px 16px;border-radius:8px;background:#eef3f8;color:#42526a;font-size:13px;line-height:1.6;">Liên kết có hiệu lực trong ${data.expiresInHours} giờ. Nếu bạn không tạo tài khoản CineBook, có thể bỏ qua email này.</div>`;
  return {
    subject: 'Xác thực tài khoản CineBook',
    text: `Xin chào ${data.fullName},\n\nHãy xác thực tài khoản CineBook tại:\n${data.verificationUrl}\n\nLiên kết có hiệu lực trong ${data.expiresInHours} giờ. Nếu bạn không tạo tài khoản, hãy bỏ qua email này.`,
    html: emailLayout({
      preheader: 'Xác thực tài khoản CineBook để bắt đầu đặt vé.',
      content,
    }),
  };
}
