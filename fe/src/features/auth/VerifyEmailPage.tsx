import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { errorMessage } from '../../utils/format';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Đang xác thực email…');
  const verificationPromiseRef = useRef<{ token: string; promise: Promise<unknown> } | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('Liên kết xác thực email không hợp lệ.');
      return;
    }

    const promise = verificationPromiseRef.current?.token === token
      ? verificationPromiseRef.current.promise
      : api.verifyEmail(token);
    verificationPromiseRef.current = { token, promise };
    void promise.then(() => {
      setState('success');
      setMessage('Email đã được xác thực. Bạn có thể đăng nhập để tiếp tục đặt vé.');
    }).catch((cause: unknown) => {
      setState('error');
      setMessage(errorMessage(cause, 'Không thể xác thực email.'));
    });
  }, [params]);

  return <main className="auth-page-shell"><section className="auth-result" aria-live="polite">
    <p className="eyebrow">CINEBOOK MEMBER</p>
    <div className={`auth-result-icon ${state}`}>{state === 'loading' ? '…' : state === 'success' ? '✓' : '!'}</div>
    <h1>{state === 'loading' ? 'Đang xác thực' : state === 'success' ? 'Xác thực thành công' : 'Xác thực chưa hoàn tất'}</h1>
    <p>{message}</p>
    {state !== 'loading' && <Link className="primary auth-result-link" to="/">Về trang chủ</Link>}
  </section></main>;
}
