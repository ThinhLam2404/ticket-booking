import { RoomFormat, ShowtimeFormat } from '@prisma/client';

export const VENUE_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const VENUE_OPEN_HOUR_VN = 8;
export const VENUE_LAST_START_HOUR_VN = 23;
export const DEFAULT_VIP_MULTIPLIER = 1.1;
export const DEFAULT_COUPLE_MULTIPLIER = 1.2;

export type PricingDayType = 'WEEKDAY' | 'WEEKEND';

type PricingBands = {
  weekday: number;
  weekend: number;
};

export const SHOWTIME_PRICING_POLICY: Record<
  RoomFormat,
  { twoD: PricingBands; threeD: PricingBands }
> = {
  [RoomFormat.STANDARD]: {
    twoD: { weekday: 110000, weekend: 130000 },
    threeD: { weekday: 145000, weekend: 185000 },
  },
  [RoomFormat.IMAX]: {
    twoD: { weekday: 155000, weekend: 185000 },
    threeD: { weekday: 190000, weekend: 240000 },
  },
  [RoomFormat.SCREEN_X]: {
    twoD: { weekday: 145000, weekend: 175000 },
    threeD: { weekday: 180000, weekend: 230000 },
  },
  [RoomFormat.FOUR_DX]: {
    twoD: { weekday: 155000, weekend: 185000 },
    threeD: { weekday: 190000, weekend: 240000 },
  },
};

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
//NOTE - xác định là ngày thường hay cuối tuần
export function getPricingDayType(date: Date): PricingDayType {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: VENUE_TIME_ZONE,
    weekday: 'short',
  }).format(date);
  return weekday === 'Fri' || weekday === 'Sat' || weekday === 'Sun'
    ? 'WEEKEND'
    : 'WEEKDAY';
}

export function isThreeDShowtime(format: ShowtimeFormat): boolean {
  return (
    format === ShowtimeFormat.THREE_D_SUBTITLED ||
    format === ShowtimeFormat.THREE_D_DUBBED
  );
}
//NOTE - lấy giá vé standard
export function getPolicyBasePrice(
  roomFormat: RoomFormat,
  showtimeFormat: ShowtimeFormat,
  startsAt: Date,
): number {
  const bands =
    SHOWTIME_PRICING_POLICY[roomFormat][
      isThreeDShowtime(showtimeFormat) ? 'threeD' : 'twoD'
    ];
  return bands[
    getPricingDayType(startsAt) === 'WEEKEND' ? 'weekend' : 'weekday'
  ];
}

export function getPricingQuote(input: {
  roomFormat: RoomFormat;
  showtimeFormat: ShowtimeFormat;
  startsAt: Date;
  basePrice?: number;
  vipMultiplier?: number;
  coupleMultiplier?: number;
}) {
  //NOTE - weekend hay weekday
  const pricingDayType = getPricingDayType(input.startsAt);
  //NOTE - lấy giá standard
  const basePrice =
    input.basePrice ??
    getPolicyBasePrice(input.roomFormat, input.showtimeFormat, input.startsAt);
  const vipMultiplier = input.vipMultiplier ?? DEFAULT_VIP_MULTIPLIER;
  const coupleMultiplier = input.coupleMultiplier ?? DEFAULT_COUPLE_MULTIPLIER;
  return {
    roomFormat: input.roomFormat,
    showtimeFormat: input.showtimeFormat,
    pricingDayType,
    basePrice,
    vipMultiplier,
    coupleMultiplier,
    prices: {
      standard: basePrice,
      vip: basePrice * vipMultiplier,
      couple: basePrice * vipMultiplier * coupleMultiplier,
    },
    overridden: {
      basePrice: input.basePrice !== undefined,
      vipMultiplier: input.vipMultiplier !== undefined,
      coupleMultiplier: input.coupleMultiplier !== undefined,
    },
  };
}
