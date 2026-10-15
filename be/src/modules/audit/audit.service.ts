import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { getCurrentActor, getCurrentRequestId } from '../../common/logging/request-context.js';

type AuditActor = { id?: string; email?: string };
type AuditValue = Record<string, unknown> | null | undefined;

const ALLOWED_KEYS = new Set(['id', 'role', 'disabledAt', 'permission', 'sessionId', 'count', 'status', 'reason', 'email', 'resourceType']);

function summary(value: AuditValue): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null) result[key] = item;
  }
  return result;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: { actor?: AuditActor; action: string; resourceType: string; resourceId?: string; before?: AuditValue; after?: AuditValue; metadata?: AuditValue },
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

  list(input: { limit?: number; action?: string; resourceType?: string; actorUserId?: string; from?: string; to?: string } = {}) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    return this.prisma.auditLog.findMany({
      where: {
        ...(input.action ? { action: input.action } : {}),
        ...(input.resourceType ? { resourceType: input.resourceType } : {}),
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...((input.from || input.to) ? { createdAt: { ...(input.from ? { gte: new Date(input.from) } : {}), ...(input.to ? { lte: new Date(input.to) } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, requestId: true, actorUserId: true, actorEmail: true, action: true, resourceType: true, resourceId: true, before: true, after: true, metadata: true, createdAt: true },
    });
  }
}
