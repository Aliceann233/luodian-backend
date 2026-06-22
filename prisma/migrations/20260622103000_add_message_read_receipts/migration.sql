-- AlterTable
ALTER TABLE "messages" ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_from_user_id_to_user_id_is_read_idx" ON "messages"("from_user_id", "to_user_id", "is_read");
