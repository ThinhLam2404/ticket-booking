export const VENUE_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const VENUE_OPEN_HOUR_VN = 8;
export const VENUE_LAST_START_HOUR_VN = 23;

export function getVnHour(date: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: VENUE_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date);
  return Number(hour);
}

export function isWithinOperatingHours(date: Date): boolean {
  const hour = getVnHour(date);
  return hour >= VENUE_OPEN_HOUR_VN && hour <= VENUE_LAST_START_HOUR_VN;
}

export function dayBoundsVn(date: string): { openAt: Date; closeAt: Date } {
  return {
    openAt: new Date(`${date}T08:00:00+07:00`),
    closeAt: new Date(`${date}T23:00:00+07:00`),
  };
}
