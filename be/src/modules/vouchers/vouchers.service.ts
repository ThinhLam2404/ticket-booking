import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VoucherDiscountType,
  VoucherScope,
  VoucherRedemptionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { toPublicResponse } from '../../common/http/response.mapper.js';
import { calculateBookingPrice } from '../bookings/booking-pricing.js';
import {
  AssignVoucherDto,
  CreateVoucherDto,
  UpdateVoucherDto,
} from './voucher.dto.js';

const ACTIVE_REDEMPTION_STATUSES = [
  VoucherRedemptionStatus.RESERVED,
  VoucherRedemptionStatus.CONSUMED,
];

type VoucherInput = {
  code?: string | null;
  userId: string;
  cinemaId: string;
  ticketPrices: Array<Prisma.Decimal | string | number>;
  combos: Array<{
    unitPrice: Prisma.Decimal | string | number;
    quantity: number;
  }>;
  now?: Date;
};

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  normalizeCode(code?: string | null) {
    const normalized = code?.trim().toUpperCase() ?? '';
    if (!normalized) return null;
    if (!/^[A-Z0-9_-]+$/.test(normalized) || normalized.length > 64) {
      throw new BadRequestException('Voucher code is invalid');
    }
    return normalized;
  }

  async list() {
    const vouchers = await this.prisma.voucher.findMany({
      include: {
        cinemas: { select: { cinemaId: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return toPublicResponse(
      vouchers.map((voucher) => this.publicVoucher(voucher)),
    );
  }

  async create(dto: CreateVoucherDto) {
    const data = this.validateConfig(dto);
    const { cinemaIds, ...voucherData } = data;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const voucher = await tx.voucher.create({
          data: {
            ...voucherData,
            cinemas: cinemaIds.length
              ? { create: cinemaIds.map((cinemaId: string) => ({ cinemaId })) }
              : undefined,
          },
          include: { cinemas: { select: { cinemaId: true } } },
        });
        await this.audit.record(
          {
            action: 'VOUCHER_CREATED',
            resourceType: 'Voucher',
            resourceId: voucher.id,
            after: voucher,
          },
          tx,
        );
        return toPublicResponse(this.publicVoucher(voucher));
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Voucher code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateVoucherDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.voucher.findUnique({
        where: { id },
        include: {
          cinemas: { select: { cinemaId: true } },
          _count: { select: { assignments: true } },
        },
      });
      if (!before) throw new NotFoundException('Voucher not found');
      const activeReservations = await tx.voucherRedemption.count({
        where: {
          voucherId: id,
          status: { in: ACTIVE_REDEMPTION_STATUSES },
        },
      });
      const data = this.validateConfig(dto, before, activeReservations > 0);
      const { cinemaIds, ...voucherData } = data;
      const voucher = await tx.voucher.update({
        where: { id },
        data: {
          ...voucherData,
          revision: { increment: 1 },
          ...(dto.cinemaIds !== undefined
            ? {
                cinemas: {
                  deleteMany: {},
                  ...(cinemaIds.length
                    ? {
                        create: cinemaIds.map((cinemaId: string) => ({
                          cinemaId,
                        })),
                      }
                    : {}),
                },
              }
            : {}),
        },
        include: {
          cinemas: { select: { cinemaId: true } },
          _count: { select: { assignments: true } },
        },
      });
      await this.audit.record(
        {
          action: 'VOUCHER_UPDATED',
          resourceType: 'Voucher',
          resourceId: id,
          before,
          after: voucher,
        },
        tx,
      );
      return toPublicResponse(this.publicVoucher(voucher));
    });
  }

  async assign(id: string, dto: AssignVoucherDto) {
    return this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findUnique({ where: { id } });
      if (!voucher) throw new NotFoundException('Voucher not found');
      const users = dto.userIds?.length
        ? await tx.user.findMany({
            where: {
              id: { in: dto.userIds },
              role: 'CUSTOMER',
              disabledAt: null,
            },
            select: { id: true },
          })
        : await tx.user.findMany({
            where: { role: 'CUSTOMER', disabledAt: null },
            select: { id: true },
          });
      const usageLimit = dto.usageLimit ?? voucher.defaultUsageLimit;
      const result = await tx.voucherAssignment.createMany({
        data: users.map((user) => ({
          voucherId: id,
          userId: user.id,
          usageLimit,
        })),
        skipDuplicates: true,
      });
      await this.audit.record(
        {
          action: 'VOUCHER_ASSIGNED',
          resourceType: 'Voucher',
          resourceId: id,
          after: { count: result.count, usageLimit },
          metadata: { source: 'ADMIN' },
        },
        tx,
      );
      return {
        voucherId: id,
        assignedCount: result.count,
        skippedCount: users.length - result.count,
        usageLimit,
      };
    });
  }

  async quote(input: VoucherInput) {
    const normalized = this.normalizeCode(input.code);
    const base = calculateBookingPrice({
      ticketPrices: input.ticketPrices,
      combos: input.combos,
    });
    if (!normalized)
      return {
        ...this.publicPricing(base),
        voucherCode: null,
        voucherDiscount: null,
      };
    const voucher = await this.loadVoucherForQuote(
      normalized,
      input.cinemaId,
      input.userId,
      input.now ?? new Date(),
    );
    const discount = this.discountFor(voucher);
    if (base.ticketSubtotal.plus(base.comboSubtotal).lt(voucher.minimumSpend)) {
      throw new ConflictException('Voucher minimum spend is not met');
    }
    const pricing = calculateBookingPrice({
      ticketPrices: input.ticketPrices,
      combos: input.combos,
      discount,
    });
    if (pricing.discountAmount.isZero())
      throw new ConflictException('Voucher does not apply to this order');
    if (pricing.totalAmount.lte(0))
      throw new ConflictException('Voucher cannot reduce the order to zero');
    return {
      ...this.publicPricing(pricing),
      voucherCode: voucher.code,
      voucherDiscount: {
        type: voucher.discountType,
        scope: voucher.scope,
        value: voucher.value,
        revision: voucher.revision,
      },
    };
  }

  async priceForTransaction(tx: Prisma.TransactionClient, input: VoucherInput) {
    const base = calculateBookingPrice({
      ticketPrices: input.ticketPrices,
      combos: input.combos,
    });
    const normalized = this.normalizeCode(input.code);
    if (!normalized) return { pricing: base, voucher: null };
    await tx.$queryRaw`SELECT "id" FROM "Voucher" WHERE "code" = ${normalized} FOR UPDATE`;
    const voucher = await this.loadVoucherForCheckout(
      normalized,
      input.cinemaId,
      input.userId,
      input.now ?? new Date(),
      tx,
    );
    if (base.ticketSubtotal.plus(base.comboSubtotal).lt(voucher.minimumSpend))
      throw new ConflictException('Voucher minimum spend is not met');
    const pricing = calculateBookingPrice({
      ticketPrices: input.ticketPrices,
      combos: input.combos,
      discount: this.discountFor(voucher),
    });
    if (pricing.discountAmount.isZero())
      throw new ConflictException('Voucher does not apply to this order');
    if (pricing.totalAmount.lte(0))
      throw new ConflictException('Voucher cannot reduce the order to zero');
    return { pricing, voucher };
  }

  async reserve(
    tx: Prisma.TransactionClient,
    input: VoucherInput & {
      bookingId: string;
      discountAmount: Prisma.Decimal;
      voucher: Awaited<
        ReturnType<VouchersService['loadVoucherForCheckout']>
      > | null;
    },
  ) {
    if (!input.voucher) return null;
    // Lock the assignment so each user receives exactly its assigned usage limit.
    await tx.$queryRaw`SELECT "id" FROM "VoucherAssignment" WHERE "id" = ${input.voucher.assignment.id} FOR UPDATE`;
    const used = await tx.voucherRedemption.count({
      where: {
        assignmentId: input.voucher.assignment.id,
        status: { in: ACTIVE_REDEMPTION_STATUSES },
      },
    });
    if (used >= input.voucher.assignment.usageLimit)
      throw new ConflictException('Voucher usage limit is exhausted');
    await tx.voucherRedemption.create({
      data: {
        voucherId: input.voucher.id,
        assignmentId: input.voucher.assignment.id,
        userId: input.userId,
        bookingId: input.bookingId,
        status: VoucherRedemptionStatus.RESERVED,
        codeSnapshot: input.voucher.code,
        revisionSnapshot: input.voucher.revision,
        discountAmount: input.discountAmount,
      },
    });
    return input.voucher;
  }

  async consume(tx: Prisma.TransactionClient, bookingId: string) {
    await tx.voucherRedemption.updateMany({
      where: { bookingId, status: VoucherRedemptionStatus.RESERVED },
      data: {
        status: VoucherRedemptionStatus.CONSUMED,
        consumedAt: new Date(),
      },
    });
  }

  async release(
    tx: Prisma.TransactionClient,
    bookingId: string,
    reason: string,
  ) {
    await tx.voucherRedemption.updateMany({
      where: { bookingId, status: VoucherRedemptionStatus.RESERVED },
      data: {
        status: VoucherRedemptionStatus.RELEASED,
        releasedAt: new Date(),
        releaseReason: reason,
      },
    });
  }

  private async loadVoucherForQuote(
    code: string,
    cinemaId: string,
    userId: string,
    now: Date,
  ) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { code },
      include: {
        cinemas: true,
        assignments: { where: { userId }, take: 1 },
      },
    });
    this.assertVoucherTerms(voucher, cinemaId, now);
    if (!voucher.assignments?.[0])
      throw new ConflictException('Voucher has not been assigned to this user');
    return { ...voucher, assignment: voucher.assignments[0] };
  }

  private async loadVoucherForCheckout(
    code: string,
    cinemaId: string,
    userId: string,
    now: Date,
    client: PrismaService | Prisma.TransactionClient,
  ) {
    const voucher = await client.voucher.findUnique({
      where: { code },
      include: {
        cinemas: true,
        assignments: { where: { userId }, take: 1 },
      },
    });
    this.assertVoucherTerms(voucher, cinemaId, now);
    const assignment = voucher.assignments?.[0];
    if (!assignment)
      throw new ConflictException('Voucher has not been assigned to this user');
    return { ...voucher, assignment };
  }

  private assertVoucherTerms(
    voucher: {
      active: boolean;
      startsAt: Date;
      endsAt: Date;
      cinemas: Array<{ cinemaId: string }>;
    } | null,
    cinemaId: string,
    now: Date,
  ): asserts voucher is NonNullable<typeof voucher> {
    if (
      !voucher ||
      !voucher.active ||
      voucher.startsAt > now ||
      voucher.endsAt <= now
    )
      throw new ConflictException('Voucher is invalid or expired');
    if (
      voucher.cinemas.length &&
      !voucher.cinemas.some((cinema) => cinema.cinemaId === cinemaId)
    )
      throw new ConflictException('Voucher is not available at this cinema');
  }

  private discountFor(voucher: {
    discountType: VoucherDiscountType;
    scope: VoucherScope;
    value: Prisma.Decimal;
    maximumDiscount: Prisma.Decimal | null;
  }) {
    return {
      type: voucher.discountType,
      scope: voucher.scope,
      value: voucher.value,
      maximumDiscount: voucher.maximumDiscount ?? undefined,
    };
  }

  private publicPricing(pricing: ReturnType<typeof calculateBookingPrice>) {
    return {
      ticketSubtotal: pricing.ticketSubtotal.toFixed(2),
      comboSubtotal: pricing.comboSubtotal.toFixed(2),
      discountAmount: pricing.discountAmount.toFixed(2),
      totalAmount: pricing.totalAmount.toFixed(2),
    };
  }

  private publicVoucher(voucher: any) {
    const { cinemas, _count, ...rest } = voucher;
    return {
      ...rest,
      usageLimit: voucher.defaultUsageLimit ?? 1,
      assignedUserCount: _count?.assignments ?? 0,
      cinemaIds: (cinemas ?? []).map(
        (cinema: { cinemaId: string }) => cinema.cinemaId,
      ),
    };
  }

  private validateConfig(
    dto: CreateVoucherDto | UpdateVoucherDto,
    before?: any,
    hasReservations = false,
  ) {
    if (
      before &&
      dto.code !== undefined &&
      this.normalizeCode(dto.code) !== before.code
    ) {
      throw new ConflictException('Voucher code cannot be changed');
    }
    const code =
      dto.code === undefined ? before?.code : this.normalizeCode(dto.code);
    const discountType = dto.discountType ?? before?.discountType;
    const scope = dto.scope ?? before?.scope;
    const value = dto.value ?? before?.value;
    const minimumSpend = dto.minimumSpend ?? before?.minimumSpend ?? 0;
    const maximumDiscount =
      dto.maximumDiscount === undefined
        ? (before?.maximumDiscount ?? null)
        : dto.maximumDiscount;
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : before?.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : before?.endsAt;
    const usageLimit = dto.usageLimit ?? before?.defaultUsageLimit ?? 1;
    if (
      !code ||
      !discountType ||
      !scope ||
      value === undefined ||
      !startsAt ||
      !endsAt ||
      endsAt <= startsAt
    )
      throw new BadRequestException('Voucher configuration is invalid');
    if (
      discountType === VoucherDiscountType.PERCENT &&
      (Number(value) <= 0 || Number(value) > 100)
    )
      throw new BadRequestException(
        'Voucher percentage must be between 0 and 100',
      );
    if (discountType === VoucherDiscountType.FIXED && Number(value) <= 0)
      throw new BadRequestException('Voucher value must be positive');
    if (
      hasReservations &&
      (discountType !== before.discountType ||
        scope !== before.scope ||
        String(value) !== String(before.value) ||
        String(minimumSpend) !== String(before.minimumSpend) ||
        String(maximumDiscount) !== String(before.maximumDiscount))
    )
      throw new ConflictException(
        'Voucher pricing terms cannot change after reservation',
      );
    const cinemaIds =
      dto.cinemaIds ??
      (before?.cinemas ?? []).map(
        (cinema: { cinemaId: string }) => cinema.cinemaId,
      );
    return {
      code,
      discountType,
      scope,
      value,
      minimumSpend,
      maximumDiscount,
      startsAt,
      endsAt,
      active: dto.active ?? before?.active ?? true,
      defaultUsageLimit: usageLimit,
      cinemaIds,
    };
  }
}
