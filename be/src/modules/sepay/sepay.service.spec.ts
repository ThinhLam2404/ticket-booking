import { BadRequestException } from '@nestjs/common';
import { Prisma, SepayIntentStatus, SepayTransactionStatus } from '@prisma/client';
import { SepayService } from './sepay.service.js';

describe('SepayService', () => {
  function createService() {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'SEPAY_BANK_CODE') return 'MB';
        if (key === 'SEPAY_ACCOUNT_NUMBER') return '0123456789';
        if (key === 'SEPAY_ACCOUNT_NAME') return 'CINEBOOK';
        return undefined;
      }),
    };

    const bookingsService = {
      expireBookingById: vi.fn().mockResolvedValue(undefined),
      releaseSeatLocks: vi.fn().mockResolvedValue(undefined),
    };

    const redis = {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(true),
    };

    const prisma = {
      booking: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      showtimeSeat: {
        count: vi.fn(),
        updateMany: vi.fn(),
      },
      sepayPaymentIntent: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      sepayTransaction: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
      refund: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      payment: {
        update: vi.fn(),
      },
      ticket: {
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const service = new SepayService(
      prisma as never,
      bookingsService as never,
      config as never,
      { queueTicketEmail: vi.fn(), queueRefundEmail: vi.fn(), wakeWorker: vi.fn() } as never,
      redis as never,
      { record: vi.fn() } as never,
    );

    return { service, prisma, bookingsService, config, redis };
  }

  describe('checkout', () => {
    it('creates a new payment intent with QR and bank info', async () => {
      const { service, prisma } = createService();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const startsAt = new Date(Date.now() + 60 * 60 * 1000);

      prisma.booking.findFirst.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: 'PENDING',
        expiresAt,
        totalAmount: new Prisma.Decimal(200000),
        items: [{ showtimeSeatId: 'seat-1' }],
        showtime: { startsAt },
        sepayIntent: null,
      });

      prisma.showtimeSeat.count.mockResolvedValue(1);

      prisma.sepayPaymentIntent.upsert.mockResolvedValue({
        id: 'intent-1',
        paymentCode: 'CB123456',
        expectedAmount: new Prisma.Decimal(200000),
        expiresAt,
        status: SepayIntentStatus.PENDING,
      });

      const result = await service.checkout('user-1', 'booking-1');

      expect(result.paymentCode).toBe('CB123456');
      expect(result.amount).toBe('200000');
      expect(result.bankCode).toBe('MB');
      expect(result.accountNumber).toBe('0123456789');
      expect(result.qrUrl).toContain('acc=0123456789');
      expect(result.qrUrl).toContain('bank=MB');
      expect(result.qrUrl).toContain('des=CB123456');
    });

    it('reuses existing pending intent if still valid', async () => {
      const { service, prisma } = createService();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const startsAt = new Date(Date.now() + 60 * 60 * 1000);

      const existingIntent = {
        id: 'intent-1',
        paymentCode: 'CB999999',
        expectedAmount: new Prisma.Decimal(150000),
        expiresAt,
        status: SepayIntentStatus.PENDING,
      };

      prisma.booking.findFirst.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: 'PENDING',
        expiresAt,
        totalAmount: new Prisma.Decimal(150000),
        items: [{ showtimeSeatId: 'seat-1' }],
        showtime: { startsAt },
        sepayIntent: existingIntent,
      });

      prisma.showtimeSeat.count.mockResolvedValue(1);

      const result = await service.checkout('user-1', 'booking-1');

      expect(result.paymentCode).toBe('CB999999');
      expect(prisma.sepayPaymentIntent.upsert).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('ignores transferType !== in', async () => {
      const { service, prisma } = createService();

      const result = await service.handleWebhook({
        id: 100,
        gateway: 'Vietcombank',
        transactionDate: '2026-09-21 12:00:00',
        accountNumber: '0123456789',
        transferType: 'out',
        transferAmount: 200000,
        content: 'Chuyen tien',
      });

      expect(result).toEqual({ success: true });
      expect(prisma.sepayTransaction.findUnique).not.toHaveBeenCalled();
    });

    it('ignores duplicate transaction id', async () => {
      const { service, prisma } = createService();

      prisma.sepayTransaction.findUnique.mockResolvedValue({ id: 'tx-1' });

      const result = await service.handleWebhook({
        id: 100,
        gateway: 'Vietcombank',
        transactionDate: '2026-09-21 12:00:00',
        accountNumber: '0123456789',
        transferType: 'in',
        transferAmount: 200000,
        content: 'CB123456 chuyen tien',
      });

      expect(result).toEqual({ success: true });
      expect(prisma.sepayTransaction.create).not.toHaveBeenCalled();
    });

    it('marks transaction REVIEW_REQUIRED when content has no matching payment code', async () => {
      const { service, prisma } = createService();

      prisma.sepayTransaction.findUnique.mockResolvedValue(null);
      prisma.sepayTransaction.create.mockResolvedValue({ id: 'tx-1' });

      const result = await service.handleWebhook({
        id: 101,
        gateway: 'Vietcombank',
        transactionDate: '2026-09-21 12:00:00',
        accountNumber: '0123456789',
        transferType: 'in',
        transferAmount: 200000,
        content: 'Khong co ma',
      });

      expect(result).toEqual({ success: true });
      expect(prisma.sepayTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: SepayTransactionStatus.REVIEW_REQUIRED,
          paymentIntentId: null,
        }),
      });
    });

    it('marks transaction REVIEW_REQUIRED when amount does not match intent', async () => {
      const { service, prisma } = createService();

      prisma.sepayTransaction.findUnique.mockResolvedValue(null);
      prisma.sepayPaymentIntent.findUnique.mockResolvedValue({
        id: 'intent-1',
        paymentCode: 'CB123456',
        expectedAmount: new Prisma.Decimal(200000),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        status: SepayIntentStatus.PENDING,
        booking: { id: 'booking-1', items: [] },
      });
      prisma.sepayTransaction.create.mockResolvedValue({ id: 'tx-1' });

      const result = await service.handleWebhook({
        id: 102,
        gateway: 'Vietcombank',
        transactionDate: '2026-09-21 12:00:00',
        accountNumber: '0123456789',
        transferType: 'in',
        transferAmount: 150000, // Chuyển thiếu
        content: 'CB123456 chuyen tien',
      });

      expect(result).toEqual({ success: true });
      expect(prisma.sepayTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: SepayTransactionStatus.REVIEW_REQUIRED,
        }),
      });
    });

    it('accepts SePay payload with code and unknown future fields', async () => {
      const { service, prisma } = createService();

      prisma.sepayTransaction.findUnique.mockResolvedValue(null);
      prisma.sepayTransaction.create.mockResolvedValue({ id: 'tx-1' });

      const result = await service.handleWebhook({
        id: 103,
        gateway: 'Vietcombank',
        transactionDate: '2026-09-21 12:00:00',
        accountNumber: '0123456789',
        subAccount: '',
        code: 'SEVN63DC8E5C',
        content: 'SEVN63DC8E5C chuyen tien',
        transferType: 'in',
        description: 'NGUYEN VAN A chuyen tien',
        transferAmount: 5000000,
        accumulated: 105000000,
        referenceCode: 'FT24012345678',
        someFutureField: 'ignored',
      });

      expect(result).toEqual({ success: true });
      expect(prisma.sepayTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: SepayTransactionStatus.REVIEW_REQUIRED,
        }),
      });
    });

    it('accepts SePay test delivery with id 0', async () => {
      const { service, prisma } = createService();

      prisma.sepayTransaction.findUnique.mockResolvedValue(null);
      prisma.sepayTransaction.create.mockResolvedValue({ id: 'tx-1' });

      const result = await service.handleWebhook({
        id: 0,
        gateway: 'SePay',
        transactionDate: '2026-09-21 17:20:31',
        accountNumber: '0000000000',
        subAccount: null,
        transferType: 'in',
        transferAmount: 10000,
        accumulated: 10000,
        code: 'SEPAYTEST',
        content: 'SEPAY TEST WEBHOOK',
        referenceCode: 'TEST1789986031',
        description: 'SePay test webhook delivery',
      });

      expect(result).toEqual({ success: true });
    });

    it('rejects payload missing required fields', async () => {
      const { service } = createService();

      await expect(
        service.handleWebhook({
          id: 104,
          transferType: 'in',
          transferAmount: 200000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
