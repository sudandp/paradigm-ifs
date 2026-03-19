ALTER TABLE "public"."companies" 
ADD COLUMN IF NOT EXISTS "location" text,
ADD COLUMN IF NOT EXISTS "address" text,
ADD COLUMN IF NOT EXISTS "logo_url" text;
