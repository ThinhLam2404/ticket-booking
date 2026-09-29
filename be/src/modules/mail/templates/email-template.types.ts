export type EmailAttachment = {
  filename: string;
  content: string;
  encoding: 'base64';
  cid: string;
};

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
};

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

export function sanitizeSubject(value: string): string {
  return value.replace(/[\r\n]/g, ' ').trim();
}

export function formatVnd(value: string | number): string {
  return `${Number(value).toLocaleString('vi-VN')} đ`;
}

export function formatVnDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}
