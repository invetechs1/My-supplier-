/** Shared shapes for the seed data modules. Kept identical to the `M` type in seed.ts. */
export type M = {
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  cat: string;
  brand?: string;
  base: number;
  specs?: Record<string, string | number | boolean>;
  featured?: boolean;
  tags?: string[];
};

export type SeedCategory = { slug: string; name: string; nameAr: string; icon: string };

export type AttributeType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";
export type SeedAttribute = {
  key: string;
  label: string;
  labelAr: string;
  type: AttributeType;
  unit?: string;
  options?: string[];
  filterable?: boolean;
};

export type SeedSupplier = {
  name: string; nameAr: string; city: string; region: string; verified: boolean; rating: number; ratingCount: number; factor: number; cats: string[];
};
