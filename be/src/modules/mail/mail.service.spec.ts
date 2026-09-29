import { MailOutboxType } from '@prisma/client';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  it('queues verification mail without sending and wakes worker after caller commits', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'outbox-1' });
    const prisma = { mailOutbox: { create } };
    const wakeWorker = vi.fn();
    const service = new MailService(prisma as never, { wake: wakeWorker } as never);
    const transaction = { mailOutbox: { create } };

    await service.queueVerificationEmail(
      { id: 'user-1', email: 'user@example.com', fullName: 'User' },
      'token-1',
      transaction as never,
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: MailOutboxType.EMAIL_VERIFICATION,
        recipient: 'user@example.com',
        payload: { fullName: 'User', token: 'token-1' },
      }),
    }));
    expect(wakeWorker).not.toHaveBeenCalled();

    service.wakeWorker();
    expect(wakeWorker).toHaveBeenCalledOnce();
  });

  it('deduplicates ticket mail through the booking key', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'outbox-1' });
    const service = new MailService({} as never, { wake: vi.fn() } as never);

    await service.queueTicketEmail('booking-1', 'user@example.com', {
      mailOutbox: { upsert },
    } as never);

    expect(upsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'TICKETS_ISSUED:booking-1' },
      create: {
        type: MailOutboxType.TICKETS_ISSUED,
        recipient: 'user@example.com',
        dedupeKey: 'TICKETS_ISSUED:booking-1',
        payload: { bookingId: 'booking-1' },
      },
      update: {},
    });
  });
});
