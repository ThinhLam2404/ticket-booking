-- DropIndex
DROP INDEX "Payment_idempotencyKey_key";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "idempotencyKey";
