import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import * as nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { Prisma, MailOutboxStatus, MailOutboxType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000];

type VerificationPayload = {
  fullName: string;
  token: string;
};

type TicketPayload = {
  bookingId: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const port = Number(config.get<string>('SMTP_PORT') ?? '587');
    const secure = config.get<string>('SMTP_SECURE') === 'true';
    this.from =
      config.get<string>('SMTP_FROM') ?? 'CineBook <no-reply@example.com>';
    this.appUrl = (
      config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'smtp.example.com',
      port,
      secure,
      ...(config.get<string>('SMTP_USER') && {
        auth: {
          user: config.get<string>('SMTP_USER'),
          pass: config.get<string>('SMTP_PASSWORD') ?? '',
        },
      }),
    });
  }
  //NOTE - tạo record email sau đó lưu vào mailbox
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

  @Cron(CronExpression.EVERY_10_SECONDS)
  async dispatchPending(): Promise<void> {
    const now = new Date();
    const staleLockAt = new Date(now.getTime() - 5 * 60 * 1000);
    const readyWhere = {
      OR: [
        {
          status: { in: [MailOutboxStatus.PENDING, MailOutboxStatus.FAILED] },
          nextAttemptAt: { lte: now },
        },
        {
          status: MailOutboxStatus.PROCESSING,
          lockedAt: { lt: staleLockAt },
        },
      ],
    } satisfies Prisma.MailOutboxWhereInput;
    const candidate = await this.prisma.mailOutbox.findFirst({
      where: readyWhere,
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) return;

    const locked = await this.prisma.mailOutbox.updateMany({
      where: { id: candidate.id, ...readyWhere },
      data: { status: MailOutboxStatus.PROCESSING, lockedAt: now },
    });
    if (locked.count !== 1) return;

    try {
      await this.sendOutbox(candidate);
      await this.prisma.mailOutbox.update({
        where: { id: candidate.id },
        data: {
          status: MailOutboxStatus.SENT,
          sentAt: new Date(),
          lockedAt: null,
        },
      });
    } catch (error) {
      const attemptCount = candidate.attemptCount + 1;
      const delay =
        RETRY_DELAYS_MS[
          Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)
        ] ?? RETRY_DELAYS_MS.at(-1)!;
      this.logger.error(
        `Mail ${candidate.id} failed on attempt ${attemptCount}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.prisma.mailOutbox.update({
        where: { id: candidate.id },
        data: {
          status: MailOutboxStatus.FAILED,
          attemptCount,
          nextAttemptAt: new Date(Date.now() + delay),
          lastError: error instanceof Error ? error.message : String(error),
          lockedAt: null,
        },
      });
    }
  }

  private async sendOutbox(outbox: Prisma.MailOutboxGetPayload<{}>) {
    if (outbox.type === MailOutboxType.EMAIL_VERIFICATION) {
      const payload = outbox.payload as VerificationPayload;
      const verificationUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(payload.token)}`;
      await this.transporter.sendMail({
        from: this.from,
        to: outbox.recipient,
        subject: 'Xác thực tài khoản CineBook',
        text: `Xin chào ${payload.fullName}, hãy xác thực tài khoản tại: ${verificationUrl}`,
        html: `<p>Xin chào ${this.escape(payload.fullName)},</p><p>Vui lòng xác thực tài khoản CineBook:</p><p><a href="${verificationUrl}">Xác thực email</a></p><p>Liên kết có hiệu lực trong 24 giờ.</p>`,
      });
      return;
    }

    const payload = outbox.payload as TicketPayload;
    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        showtime: {
          include: { movie: true, room: { include: { cinema: true } } },
        },
        tickets: {
          include: {
            bookingItem: {
              include: { showtimeSeat: { include: { seat: true } } },
            },
          },
        },
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
    const ticketRows = booking.tickets
      .map((ticket) => {
        const seat = ticket.bookingItem.showtimeSeat.seat;
        return `<li><strong>${this.escape(ticket.code)}</strong> · Ghế ${this.escape(`${seat.row}${seat.number}`)}<br><img src="cid:ticket-${ticket.code}@cinebook" width="220" alt="QR vé ${this.escape(ticket.code)}"></li>`;
      })
      .join('');
    const showtimeLabel = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(booking.showtime.startsAt);
    await this.transporter.sendMail({
      from: this.from,
      to: outbox.recipient,
      subject: `Vé CineBook · ${booking.showtime.movie.title}`,
      text: `Vé CineBook cho ${booking.showtime.movie.title}. Mã vé: ${booking.tickets.map((ticket) => ticket.code).join(', ')}`,
      html: `<h2>Thanh toán thành công</h2><p>${this.escape(booking.showtime.movie.title)} · ${this.escape(booking.showtime.room.cinema.name)} · ${this.escape(showtimeLabel)}</p><ul>${ticketRows}</ul>`,
      attachments,
    });
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private escape(value: string) {
    return value.replace(
      /[&<>'"]/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
        })[character] ?? character,
    );
  }
}
