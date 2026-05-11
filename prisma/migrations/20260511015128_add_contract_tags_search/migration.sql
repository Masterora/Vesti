-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
