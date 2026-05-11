ALTER TABLE "User"
ADD COLUMN "displayName" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "bio" TEXT;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
