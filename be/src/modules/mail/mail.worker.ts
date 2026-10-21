import { parentPort, workerData } from 'node:worker_threads';
import {
  PrismaClient,
  MailOutboxStatus,
  MailOutboxType,
  Prisma,
} from '@prisma/client';
import * as nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import type { MailWorkerData } from './mail-worker.supervisor.js';
import { renderTicketEmail } from './templates/ticket-email.template.js';
import { renderVerificationEmail } from './templates/verification-email.template.js';
import { renderPasswordResetEmail } from './templates/password-reset-email.template.js';
import { renderRefundEmail } from './templates/refund-email.template.js';
import { renderAdminInvitationEmail } from './templates/admin-invitation-email.template.js';
import { invitationDeliveryToken, invitationTokenHash } from './admin-invitation-delivery.js';

const data = workerData as MailWorkerData;
const prisma = new PrismaClient({
  datasources: { db: { url: data.databaseUrl } },
});
const transporter = nodemailer.createTransport({
  host: data.smtpHost,
  port: data.smtpPort,
  secure: data.smtpSecure,
  connectionTimeout: 15000,
  socketTimeout: 30000,
  ...(data.smtpUser && {
    auth: { user: data.smtpUser, pass: data.smtpPassword ?? '' },
  }),
});
const retryDelaysMs = [60000, 300000, 1800000, 7200000];
let timer: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;
let closed = false;

parentPort?.on('message', (message: { type: string }) => {
  if (message.type === 'wake') {
    if (timer) clearTimeout(timer);
    void drain();
  }
  if (message.type === 'shutdown') {
    stopping = true;
    if (timer) clearTimeout(timer);
    if (!running) void shutdown();
  }
});

void bootstrap().catch(async (error) => {
  parentPort?.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  });
  try {
    transporter.close();
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});

async function bootstrap() {
  await prisma.$connect();
  parentPort?.postMessage({ type: 'ready' });
  await drain();
}

async function drain(): Promise<void> {
  if (running || stopping) {
    if (stopping && !running) await shutdown();
    return;
  }
  running = true;
  try {
    while (!stopping) {
      const outbox = await claimNext();
      if (!outbox) break;
      parentPort?.postMessage({ type: 'processing', outboxId: outbox.id });
      await processOutbox(outbox);
    }
    parentPort?.postMessage({ type: 'idle' });
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
    if (stopping) await shutdown();
    else schedulePoll();
  }
}

async function claimNext() {
  const now = new Date();
  const staleLockAt = new Date(now.getTime() - data.staleLockMs);
  const readyWhere: Prisma.MailOutboxWhereInput = {
    OR: [
      {
        status: MailOutboxStatus.PENDING,
        nextAttemptAt: { lte: now },
      },
      {
        status: MailOutboxStatus.FAILED,
        attemptCount: { lt: data.maxAttempts },
        nextAttemptAt: { lte: now },
      },
      { status: MailOutboxStatus.PROCESSING, lockedAt: { lt: staleLockAt } },
    ],
  };
  const candidate = await prisma.mailOutbox.findFirst({
    where: readyWhere,
    orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return null;
  const locked = await prisma.mailOutbox.updateMany({
    where: { id: candidate.id, ...readyWhere },
    data: { status: MailOutboxStatus.PROCESSING, lockedAt: now },
  });
  return locked.count === 1 ? candidate : null;
}

async function processOutbox(outbox: Prisma.MailOutboxGetPayload<{}>) {
  try {
    if (outbox.type === MailOutboxType.ADMIN_INVITATION) {
      const token = invitationDeliveryToken(outbox.payload);
      const active = token ? await prisma.adminInvitation.findFirst({
        where: { tokenHash: invitationTokenHash(token), email: outbox.recipient, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      }) : null;
      if (!active) {
        // Superseded/expired mail must not retry or retain its bearer token.
        await prisma.mailOutbox.deleteMany({ where: { id: outbox.id } });
        return;
      }
    }
    const rendered = await renderOutbox(outbox);
    await transporter.sendMail({
      from: data.smtpFrom,
      to: outbox.recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments: rendered.attachments,
      messageId: `<cinebook-${outbox.id}@cinebook>`,
    });
    await prisma.mailOutbox.update({
      where: { id: outbox.id },
      data: {
        status: MailOutboxStatus.SENT,
        sentAt: new Date(),
        lockedAt: null,
        ...((outbox.type === MailOutboxType.EMAIL_VERIFICATION || outbox.type === MailOutboxType.PASSWORD_RESET || outbox.type === MailOutboxType.ADMIN_INVITATION) && {
          payload: { sent: true },
        }),
      },
    });
    parentPort?.postMessage({ type: 'sent', outboxId: outbox.id });
  } catch (error) {
    const attemptCount = outbox.attemptCount + 1;
    const delay =
      retryDelaysMs[Math.min(attemptCount - 1, retryDelaysMs.length - 1)] ??
      retryDelaysMs.at(-1)!;
    await prisma.mailOutbox.update({
      where: { id: outbox.id },
      data: {
        status: MailOutboxStatus.FAILED,
        attemptCount,
        nextAttemptAt: new Date(Date.now() + delay),
        lastError: error instanceof Error ? error.message : String(error),
        lockedAt: null,
      },
    });
    parentPort?.postMessage({
      type: 'failed',
      outboxId: outbox.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function renderOutbox(outbox: Prisma.MailOutboxGetPayload<{}>) {
  if (outbox.type === MailOutboxType.EMAIL_VERIFICATION) {
    const payload = outbox.payload as { fullName: string; token: string };
    return renderVerificationEmail({
      fullName: payload.fullName,
      verificationUrl: `${data.publicAppUrl}/verify-email?token=${encodeURIComponent(payload.token)}`,
      expiresInHours: 24,
    });
  }
  if (outbox.type === MailOutboxType.PASSWORD_RESET) {
    const payload = outbox.payload as { fullName: string; token: string };
    return renderPasswordResetEmail({
      fullName: payload.fullName,
      resetUrl: `${data.publicAppUrl}/reset-password?token=${encodeURIComponent(payload.token)}`,
      expiresInMinutes: 30,
    });
  }
  if (outbox.type === MailOutboxType.ADMIN_INVITATION) {
    const payload = outbox.payload as { token: string; permissions: string[] };
    return renderAdminInvitationEmail({
      invitationUrl: `${data.publicAppUrl}/admin/accept-invitation?token=${encodeURIComponent(payload.token)}`,
      permissions: payload.permissions,
      expiresInHours: 24,
    });
  }
  if (outbox.type === MailOutboxType.REFUND_NOTIFICATION) {
    const payload = outbox.payload as { bookingId: string; amount: string; reason: string };
    const booking = await prisma.booking.findUnique({ where: { id: payload.bookingId }, include: { user: true } });
    if (!booking) throw new Error('Refund booking not found');
    return renderRefundEmail({ fullName: booking.user.fullName, bookingId: payload.bookingId, amount: payload.amount, reason: payload.reason });
  }
  const payload = outbox.payload as { bookingId: string };
  const booking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: {
      user: true,
      showtime: {
        include: { movie: true, room: { include: { cinema: true } } },
      },
      items: {
        include: { showtimeSeat: { include: { seat: true } }, ticket: true },
      },
      tickets: true,
      comboItems: true,
    },
  });
  if (!booking || booking.status !== 'CONFIRMED')
    throw new Error('Confirmed booking not found');
  const attachments = await Promise.all(
    booking.tickets.map(async (ticket) => ({
      filename: `${ticket.code}.png`,
      content: (
        await QRCode.toBuffer(`cinebook-ticket:v1:${ticket.code}`, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 220,
          color: { dark: '#101820', light: '#ffffff' },
        })
      ).toString('base64'),
      encoding: 'base64' as const,
      cid: `ticket-${ticket.code}@cinebook`,
    })),
  );
  return renderTicketEmail({
    fullName: booking.user.fullName,
    appUrl: data.publicAppUrl,
    bookingId: booking.id,
    totalAmount: booking.totalAmount.toString(),
    combos: booking.comboItems.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice.toString() })),
    movieTitle: booking.showtime.movie.title,
    cinemaName: booking.showtime.room.cinema.name,
    cinemaAddress: booking.showtime.room.cinema.address,
    roomName: booking.showtime.room.name,
    startsAt: booking.showtime.startsAt,
    endsAt: booking.showtime.endsAt,
    tickets: booking.tickets.map((ticket) => {
      const item = booking.items.find(
        (bookingItem) => bookingItem.ticket?.id === ticket.id,
      );
      const seat = item?.showtimeSeat.seat;
      return {
        code: ticket.code,
        seatLabel: `${seat?.row ?? ''}${seat?.number ?? ''}`,
        price: item?.price.toString() ?? '0',
        qrCid: `ticket-${ticket.code}@cinebook`,
      };
    }),
    attachments,
  });
}

function schedulePoll() {
  timer = setTimeout(() => {
    timer = undefined;
    void drain();
  }, data.pollMs);
  timer.unref?.();
}

async function shutdown() {
  if (closed) return;
  closed = true;
  try {
    transporter.close();
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    await prisma.$disconnect();
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  parentPort?.postMessage({ type: 'stopped' });
}
