/** Centralized English naming rule: the English common name is the primary
 *  species identity; the scientific name is secondary metadata. If no English
 *  name exists in the source, the scientific name is used and the caller
 *  should label it as a fallback (rows carry `enIsFallback` from the API). */
export interface NamedLike {
  id: string;
  en: string | null;
  sci: string;
}

export function displayName(row: NamedLike, _names?: Record<string, string>): string {
  void _names; // legacy parameter; English resolution no longer uses a map
  return row.en ?? row.sci;
}
