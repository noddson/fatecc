import MiniSearch from 'minisearch';
import type { ReferenceEntry, WorldEntry } from '../domain/types';
import sourceEntries from './reference.json';
import sourceMetadata from './source-metadata.json';

export const REFERENCE_ENTRIES: ReferenceEntry[] = sourceEntries;
export const REFERENCE_METADATA = sourceMetadata;
export const REFERENCE_CATEGORIES = [...new Set(REFERENCE_ENTRIES.map((entry) => entry.category))];
export function createReferenceSearch(
  entries: ReferenceEntry[] = REFERENCE_ENTRIES,
): MiniSearch<ReferenceEntry> {
  const search = new MiniSearch<ReferenceEntry>({
    fields: ['title', 'body', 'category', 'tags'],
    storeFields: ['title', 'category', 'body', 'source', 'tags', 'page'],
    searchOptions: { boost: { title: 4, tags: 2 }, prefix: true, fuzzy: 0.15 },
  });
  search.addAll(entries);
  return search;
}
const coreSearch = createReferenceSearch();
const coreEntriesById = new Map(REFERENCE_ENTRIES.map((entry) => [entry.id, entry]));
export function searchReferences(query: string, category?: string): ReferenceEntry[] {
  const matches = query.trim()
    ? coreSearch.search(query).map((result) => coreEntriesById.get(String(result.id))!)
    : REFERENCE_ENTRIES;
  return category ? matches.filter((entry) => entry.category === category) : matches;
}
export function campaignReferences(world: WorldEntry[]): ReferenceEntry[] {
  return world
    .filter((entry) => entry.kind === 'reference')
    .map((entry) => ({
      id: `campaign-${entry.id}`,
      title: entry.title,
      category: 'Campaign references',
      body: entry.body,
      source: 'Your campaign',
      tags: entry.tags,
    }));
}
