import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import {
  getCurrentActor,
  getCurrentRequestId,
} from '../../common/logging/request-context.js';

type AuditActor = { id?: string; email?: string };
type AuditValue = Record<string, unknown> | null | undefined;

const ALLOWED_KEYS = new Set([
  'id',
  'role',
  'disabledAt',
  'permission',
  'permissions',
  'sessionId',
  'count',
  'status',
  'reason',
  'email',
  'resourceType',
  'expiresAt',
  'invitationId',
  'userId',
]);
for (const key of [
  'name',
  'address',
  'provinceCode',
  'cinemaId',
  'roomId',
  'movieId',
  'format',
  'row',
  'number',
  'type',
  'startsAt',
  'endsAt',
  'basePrice',
  'vipMultiplier',
  'coupleMultiplier',
  'active', 'price', 'comboId', 'comboSubtotal', 'ticketSubtotal', 'discountAmount', 'pricingVersion',
  'title',
  'tmdbId',
  'duration',
  'releaseDate',
  'rating',
  'genres',
  'ageRating',
  'posterUrl',
  'backdropUrl',
  'trailerKey',
  'showtimeId',
  'bookingId',
  'totalAmount',
  'code',
  'discountType',
  'scope',
  'value',
  'minimumSpend',
  'maximumDiscount',
  'startsAt',
  'endsAt',
  'defaultUsageLimit',
  'usageLimit',
  'assignedUserCount',
  'revision',
  'cinemaIds',
  'releaseReason',
  'source',
])
  ALLOWED_KEYS.add(key);

function summary(value: AuditValue): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (item instanceof Date) result[key] = item.toISOString();
    else if (item instanceof Prisma.Decimal) result[key] = item.toString();
    else if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      item === null
    )
      result[key] = item;
    else if (
      Array.isArray(item) &&
      item.every((entry) => typeof entry === 'string')
    )
      result[key] = item;
  }
  return result;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: {
      actor?: AuditActor;
      action: string;
      resourceType: string;
      resourceId?: string;
      before?: AuditValue;
      after?: AuditValue;
      metadata?: AuditValue;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<AuditLog> {
    return client.auditLog.create({
      data: {
        requestId: getCurrentRequestId(),
        actorUserId: input.actor?.id ?? getCurrentActor().id,
        actorEmail: input.actor?.email ?? getCurrentActor().email,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: summary(input.before),
        after: summary(input.after),
        metadata: summary(input.metadata),
      },
    });
  }

  list(
    input: {
      limit?: number;
      search?: string;
      action?: string;
      resourceType?: string;
      actorUserId?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const search = input.search?.trim();
    return this.prisma.auditLog.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { action: { contains: search, mode: 'insensitive' } },
                { resourceType: { contains: search, mode: 'insensitive' } },
                { resourceId: { contains: search, mode: 'insensitive' } },
                { actorUserId: { contains: search, mode: 'insensitive' } },
                { actorEmail: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(input.action
          ? { action: { contains: input.action.trim(), mode: 'insensitive' } }
          : {}),
        ...(input.resourceType
          ? {
              resourceType: {
                contains: input.resourceType.trim(),
                mode: 'insensitive',
              },
            }
          : {}),
        ...(input.actorUserId
          ? {
              actorUserId: {
                contains: input.actorUserId.trim(),
                mode: 'insensitive',
              },
            }
          : {}),
        ...(input.from || input.to
          ? {
              createdAt: {
                ...(input.from ? { gte: new Date(input.from) } : {}),
                ...(input.to ? { lte: new Date(input.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        requestId: true,
        actorUserId: true,
        actorEmail: true,
        action: true,
        resourceType: true,
        resourceId: true,
        before: true,
        after: true,
        metadata: true,
        createdAt: true,
      },
    });
  }
}
