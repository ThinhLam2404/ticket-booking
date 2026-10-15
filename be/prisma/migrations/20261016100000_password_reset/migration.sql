CREATE TYPE "MailOutboxType_new" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'TICKETS_ISSUED', 'REFUND_NOTIFICATION');
ALTER TABLE "MailOutbox" ALTER COLUMN "type" TYPE "MailOutboxType_new" USING ("type"::text::"MailOutboxType_new");
DROP TYPE "MailOutboxType";
ALTER TYPE "MailOutboxType_new" RENAME TO "MailOutboxType";

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_consumedAt_idx" ON "PasswordResetToken"("userId", "consumedAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
