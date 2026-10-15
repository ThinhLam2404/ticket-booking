import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, MailOutboxType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { MailWorkerSupervisor } from './mail-worker.supervisor.js';

type VerificationPayload = {
  fullName: string;
  token: string;
};

type PasswordResetPayload = {
  fullName: string;
  token: string;
};

@Injectable()
export class MailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: MailWorkerSupervisor,
  ) {}

  async queueVerificationEmail(
    user: { id: string; email: string; fullName: string },
    token: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const tokenHash = this.hashToken(token);
    await client.mailOutbox.create({
      data: {
        type: MailOutboxType.EMAIL_VERIFICATION,
        recipient: user.email,
        dedupeKey: `EMAIL_VERIFICATION:${user.id}:${tokenHash}`,
        payload: {
          fullName: user.fullName,
          token,
        } satisfies VerificationPayload,
      },
    });
  }

  async queuePasswordResetEmail(
    user: { id: string; email: string; fullName: string },
    token: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const tokenHash = this.hashToken(token);
    await client.mailOutbox.create({
      data: {
        type: MailOutboxType.PASSWORD_RESET,
        recipient: user.email,
        dedupeKey: `PASSWORD_RESET:${user.id}:${tokenHash}`,
        payload: { fullName: user.fullName, token } satisfies PasswordResetPayload,
      },
    });
  }

  async queueTicketEmail(
    bookingId: string,
    recipient: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await client.mailOutbox.upsert({
      where: { dedupeKey: `TICKETS_ISSUED:${bookingId}` },
      create: {
        type: MailOutboxType.TICKETS_ISSUED,
        recipient,
        dedupeKey: `TICKETS_ISSUED:${bookingId}`,
        payload: { bookingId },
      },
      update: {},
    });
  }

  wakeWorker(): void {
    this.worker.wake();
  }

  async queueRefundEmail(
    bookingId: string,
    recipient: string,
    amount: string,
    reason: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await client.mailOutbox.upsert({
      where: { dedupeKey: `REFUND_NOTIFICATION:${bookingId}` },
      create: {
        type: MailOutboxType.REFUND_NOTIFICATION,
        recipient,
        dedupeKey: `REFUND_NOTIFICATION:${bookingId}`,
        payload: { bookingId, amount, reason },
      },
      update: {},
    });
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
