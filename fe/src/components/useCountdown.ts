import { useEffect, useState } from 'react';

export function useCountdown(expiresAt?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const seconds = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return {
    seconds,
    isExpired: seconds === 0,
    label: `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`,
  };
}
