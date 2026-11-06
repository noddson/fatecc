import readingLinks from './reading-links.json';

// Website destinations are reading aids. Bundled rules remain pinned to the
// GitHub source; its line numbers let both the importer and UI share this map.
export function coreReadingUrl(sourceLine: number): string {
  let path = readingLinks.sections[0].path;
  for (const section of readingLinks.sections) {
    if (section.sourceLine > sourceLine) break;
    path = section.path;
  }
  return `${readingLinks.baseUrl}${path}`;
}
