import type { M } from "./types";
import { mroMaterials } from "./materials-mro";
import { facilityMaterials } from "./materials-facility";
import { systemsMaterials } from "./materials-systems";
import { servicesMaterials } from "./materials-services";

export { extraCategories } from "./categories";
export { categoryAttributes } from "./attributes";
export { extraSuppliers, supplierCategoryExtensions } from "./suppliers";
export { specPatches, reviewTexts, questionTexts } from "./extras";
export type { M, SeedAttribute, SeedCategory, SeedSupplier } from "./types";

/** All MRO / facility products appended to the construction catalogue in seed.ts. */
export const extraMaterials: M[] = [...mroMaterials, ...facilityMaterials, ...systemsMaterials, ...servicesMaterials];
