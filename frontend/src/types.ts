/** Shared types mirroring backend response models. */

export interface Filters {
  q?: string | null;
  orders?: string[];
  families?: string[];
  genera?: string[];
  habitat?: string[];
  migration?: string[];
  trophicLevel?: string[];
  trophicNiche?: string[];
  lifestyle?: string[];
  iucn?: string[];
  breedingRegion?: string[];
  massMin?: number | null;
  massMax?: number | null;
  excludeImputed?: boolean;
  traitsOnly?: boolean;
  conservationOnly?: boolean;
  geoOnly?: boolean;
}

export const EMPTY_FILTERS: Filters = {};

export interface SpeciesRow {
  id: string;
  en: string | null;
  enIsFallback?: boolean;
  sci: string;
  order: string;
  family: string;
  familyEnglish: string | null;
  genus: string;
  iucn: string | null;
  habitat: string | null;
  migration: string | null;
  massG: number | null;
  subspeciesCount: number;
  seq: number;
  taxonConcept: string;
  traitsInferred: boolean;
  breedingRegion: string | null;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface DatasetMeta {
  version: string;
  taxonomy: string;
  declaredCount: number;
  actualCount: number;
  countMatches: boolean;
}

export interface MetaResponse {
  dataset: DatasetMeta;
  /** Provenance fact: number of language codes present in the source names data. */
  sourceLanguageCount: number;
  facetOptions: Record<string, FacetOption[]>;
  iucnSequence: string[];
}
