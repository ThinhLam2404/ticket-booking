import { emailLayout } from './email-layout.js';
import { escapeHtml, type RenderedEmail } from './email-template.types.js';

export function renderAdminInvitationEmail(data: { invitationUrl: string; permissions: string[]; expiresInHours: number }): RenderedEmail {
  const invitationUrl = escapeHtml(data.invitationUrl);
  const permissions = data.permissions.map((permission) => escapeHtml(permission)).join(', ');
  const content = `
    <div style="color:#0b64dd;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">LỜI MỜI QUẢN TRỊ</div>
    <h1 style="margin:12px 0 16px;color:#0e1b35;font-size:30px;line-height:1.1;letter-spacing:-.04em;">Bạn được mời quản trị CineBook</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Một quản trị viên đã mời bạn tham gia vận hành CineBook.</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;"><strong>Quyền được cấp:</strong> ${permissions}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:8px;background:#0b64dd;"><a href="${invitationUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Chấp nhận lời mời</a></td></tr></table>
    <p style="margin:24px 0 8px;color:#42526a;font-size:13px;line-height:1.6;">Nếu nút không hoạt động, hãy sao chép liên kết sau:</p>
    <p style="margin:0;word-break:break-all;color:#0755bd;font-size:12px;line-height:1.6;">${invitationUrl}</p>
    <div style="margin-top:24px;padding:14px 16px;border-radius:8px;background:#eef3f8;color:#42526a;font-size:13px;line-height:1.6;">Liên kết có hiệu lực trong ${data.expiresInHours} giờ và chỉ sử dụng được một lần.</div>`;
  return {
    subject: 'Lời mời quản trị CineBook',
    text: `Bạn được mời quản trị CineBook.\n\nQuyền được cấp: ${data.permissions.join(', ')}\n\nChấp nhận lời mời tại:\n${data.invitationUrl}\n\nLiên kết có hiệu lực trong ${data.expiresInHours} giờ và chỉ dùng một lần.`,
    html: emailLayout({ preheader: 'Bạn được mời tham gia vận hành CineBook.', content }),
  };
}
