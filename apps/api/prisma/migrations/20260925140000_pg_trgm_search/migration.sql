-- Fuzzy product search: trigram similarity on material names (typo tolerance, e.g. "cemnt" -> cement).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Material_name_trgm_idx" ON "Material" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Material_nameAr_trgm_idx" ON "Material" USING GIN ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Material_brand_trgm_idx" ON "Material" USING GIN ("brand" gin_trgm_ops);
