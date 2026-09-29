import { escapeHtml } from './email-template.types.js';

type EmailLayoutOptions = {
  preheader: string;
  content: string;
  footer?: string;
};

export function emailLayout({ preheader, content, footer = 'CineBook Vietnam · Trải nghiệm điện ảnh trong tầm tay.' }: EmailLayoutOptions): string {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>CineBook</title>
  </head>
  <body style="margin:0;background:#f6f8fb;color:#24344d;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f6f8fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #d3dce8;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#0e1b35;color:#ffffff;">
                <div style="font-size:24px;line-height:1;font-weight:700;letter-spacing:-.04em;">Cine<span style="color:#60a5fa;">Book</span></div>
                <div style="margin-top:8px;color:#c7d1de;font-size:11px;letter-spacing:.16em;text-transform:uppercase;">Cinema, curated for you</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">${content}</td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid #d3dce8;color:#64748b;font-size:12px;line-height:1.6;">${footer}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
