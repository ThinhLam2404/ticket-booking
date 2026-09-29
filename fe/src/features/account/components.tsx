import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { posterStyle } from '../../utils/media';

export function QrCode({ code }: { code: string }) {
  const [state, setState] = useState<{ src: string; error: boolean }>({ src: '', error: false });

  useEffect(() => {
    let active = true;
    setState({ src: '', error: false });
    void QRCode.toDataURL(`cinebook-ticket:v1:${code}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#101820', light: '#ffffff' },
    }).then((url) => {
      if (active) setState({ src: url, error: false });
    }).catch(() => {
      if (active) setState({ src: '', error: true });
    });
    return () => {
      active = false;
    };
  }, [code]);

  if (state.src) return <img className="qr-code" src={state.src} alt={`Mã QR vé ${code}`} width={220} height={220} />;
  return <div className={`qr-code qr-code-loading ${state.error ? 'qr-code-error' : ''}`} role="status" aria-label={state.error ? `Không thể tạo mã QR ${code}` : `Đang tạo mã QR ${code}`}>{state.error ? 'QR lỗi' : null}</div>;
}

export function TicketPoster({ title, posterUrl, className = '' }: { title: string; posterUrl?: string | null; className?: string }) {
  return <div className={`ticket-poster-image ${className}`} style={posterStyle(title, posterUrl)} />;
}
