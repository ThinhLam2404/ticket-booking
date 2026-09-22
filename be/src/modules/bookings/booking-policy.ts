export const HOLD_TTL_SECONDS = 10 * 60; //NOTE - còn >15 phút thì Hold 10 phút
export const SHORT_HOLD_TTL_SECONDS = 2 * 60; //NOTE - 5-15 phút Hold 2 phút
export const SHOWTIME_BUFFER_SECONDS = 5 * 60; //NOTE - 5 phút ko cho tạo booking
export const SHORT_HOLD_THRESHOLD_SECONDS =
  HOLD_TTL_SECONDS + SHOWTIME_BUFFER_SECONDS; //NOTE - ngưỡng thời gian so sánh để hold

export function computeHoldTtl(secondsUntilShowtime: number): number {
  const maxDeadline = secondsUntilShowtime - SHOWTIME_BUFFER_SECONDS;
  if (maxDeadline <= 0) {
    return 0;
  }
  const preferred =
    secondsUntilShowtime > SHORT_HOLD_THRESHOLD_SECONDS
      ? HOLD_TTL_SECONDS
      : SHORT_HOLD_TTL_SECONDS;
  return Math.min(preferred, maxDeadline);
}
