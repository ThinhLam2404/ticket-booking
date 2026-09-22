-- CreateEnum
CREATE TYPE "SepayIntentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SepayTransactionStatus" AS ENUM ('MATCHED', 'CONFIRMED', 'REVIEW_REQUIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "SepayPaymentIntent" (
    "id" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "status" "SepayIntentStatus" NOT NULL DEFAULT 'PENDING',
    "expectedAmount" DECIMAL(10,2) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SepayPaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SepayTransaction" (
    "id" TEXT NOT NULL,
    "sepayId" INTEGER NOT NULL,
    "gateway" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "transferAmount" DECIMAL(10,2) NOT NULL,
    "content" TEXT NOT NULL,
    "referenceCode" TEXT,
    "transferType" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "status" "SepayTransactionStatus" NOT NULL DEFAULT 'MATCHED',
    "adminNote" TEXT,
    "paymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SepayTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SepayPaymentIntent_paymentCode_key" ON "SepayPaymentIntent"("paymentCode");

-- CreateIndex
CREATE UNIQUE INDEX "SepayPaymentIntent_bookingId_key" ON "SepayPaymentIntent"("bookingId");

-- CreateIndex
CREATE INDEX "SepayPaymentIntent_status_expiresAt_idx" ON "SepayPaymentIntent"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SepayPaymentIntent_paymentCode_idx" ON "SepayPaymentIntent"("paymentCode");

-- CreateIndex
CREATE UNIQUE INDEX "SepayTransaction_sepayId_key" ON "SepayTransaction"("sepayId");

-- CreateIndex
CREATE INDEX "SepayTransaction_paymentIntentId_idx" ON "SepayTransaction"("paymentIntentId");

-- CreateIndex
CREATE INDEX "SepayTransaction_status_idx" ON "SepayTransaction"("status");

-- AddForeignKey
ALTER TABLE "SepayPaymentIntent" ADD CONSTRAINT "SepayPaymentIntent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SepayTransaction" ADD CONSTRAINT "SepayTransaction_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "SepayPaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
