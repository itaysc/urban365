-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "input" JSONB NOT NULL,
    "settlementCode" INTEGER,
    "city" TEXT NOT NULL,
    "gush" INTEGER,
    "chelka" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "rooms" DOUBLE PRECISION NOT NULL,
    "area" INTEGER NOT NULL,
    "low" INTEGER,
    "high" INTEGER,
    "expected" INTEGER,
    "asking" INTEGER,
    "verdict" TEXT NOT NULL,
    "workings" JSONB NOT NULL,
    "paramsVersion" INTEGER NOT NULL,
    "paramsBase" TEXT NOT NULL,
    "effectiveComps" DOUBLE PRECISION NOT NULL,
    "spread" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Valuation_createdAt_idx" ON "Valuation"("createdAt");

-- CreateIndex
CREATE INDEX "Valuation_userId_createdAt_idx" ON "Valuation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Valuation_settlementCode_verdict_idx" ON "Valuation"("settlementCode", "verdict");

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
