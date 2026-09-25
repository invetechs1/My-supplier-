-- CreateTable
CREATE TABLE "ReviewVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewVote_reviewId_userId_key" ON "ReviewVote"("reviewId", "userId");

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

