# Reference library provenance

The app's rules source is [fate-srd/fate-srd-content](https://github.com/fate-srd/fate-srd-content), pinned to commit `93ed848e723f31b4994b466b7241011ba24be885` and reviewed on 2026-11-06. Rules imports do not read the retail PDF or scrape rendered Fate SRD website pages. The official website is consulted for its [licensing and attribution guidance](https://fate-srd.com/official-licensing-fate) and readable reference destinations, not as the source of bundled rules prose.

## Readable rules links

Rules badges, character validation, printed rules references, and each library article's **Read this section on Fate-SRD.com** link open the corresponding human-readable website page. For example, the backstory-phases reminder opens [The Phase Trio](https://fate-srd.com/fate-core/phase-trio). GitHub links are kept separately in source-attribution details so the exact bundled edition remains auditable.

`src/content/reading-links.json` maps the pinned source's sections to official website routes and subsection anchors. The 2026-11-06 audit checked all 90 linked pages' heading labels and IDs, including [Balancing Stunt Utility](https://fate-srd.com/fate-core/building-stunts#balancing-stunt-utility). Entries use the specific matching heading whenever available; page-level entries and material without its own website heading use the enclosing page. `reading-headings.json` retains only heading/navigation metadata, with no website rule prose. The importer adds a `readingUrl` for all 310 references while retaining `sourceUrl`, source lines, body text, and the content version. Reading links may lead to a newer website edition; the bundled text and campaign rules stay pinned. Updating the source revision requires reviewing this mapping.

Run `python3 scripts/audit-reading-links.py --check` to check curated fragment targets against the saved heading metadata offline. Use `--refresh` to fetch updated heading metadata from the official pages before reviewing destination changes. The normal rules importer stays offline and reads only the pinned GitHub source.

## Why Core uses the repository's HTML source

The preferred upstream Markdown file, [`docs/markdown/fate-core.md`](https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/docs/markdown/fate-core.md), explicitly identifies itself as an **OGL** edition. Its formatter, John Alan Large, also states that examples were removed. It is not used as the app's complete CC-BY Core reference.

The repository's [`source/fate-core-SRD.html`](https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/source/fate-core-SRD.html) explicitly carries **Creative Commons Attribution 3.0 Unported**, the original copyright, and the required Core/Accelerated attribution. The [upstream README](https://github.com/fate-srd/fate-srd-content/blob/93ed848e723f31b4994b466b7241011ba24be885/README.md) describes `source/` as copies of the official SRD files. This file is the canonical input; the importer generates a local Markdown edition from it. This preserves the requested GitHub provenance without silently switching licenses or using an abridged source.

## Retained sources and generated content

| Artifact                                            | Purpose                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/content/source/fate-core-SRD.html`             | Unmodified repository Core source bytes                                          |
| `src/content/source/UPSTREAM-README.md`             | Repository instructions, credits, and licensing pointers                         |
| `src/content/source-lock.json`                      | Pinned repository/source provenance and upstream document inventory              |
| `src/content/source/fate-core.generated.md`         | Locally generated Markdown derived only from the pinned CC-BY input              |
| `src/content/reference.json`                        | Generated heading-based plain-text entries used for offline search and display   |
| `src/content/source-metadata.json`                  | Runtime provenance, version, attribution, and conversion metadata                |
| `src/content/reading-links.json`                    | Verified website reading destinations, separate from source provenance           |
| `src/content/LICENSE.txt`, `public/LICENSE-SRD.txt` | Identical complete attribution notices, including separate logo/font permissions |

The canonical file's Git blob is `5ef6f2d0e9ce8ebe235c3da453ce91c00353a528`; its SHA-256 is `d345efb80ca2221df88157d4e553d247662661781cac04e610d4c3147cba07ec`. The importer verifies the pinned input and generates content offline. The application does not fetch rules at runtime.

The generated editions normalize HTML markup and whitespace, divide reference entries by headings, and omit empty graphical placeholders. They preserve the original copyright and attribution. Reference text is displayed as text, not trusted source HTML. App-written explanations and Lantern Coast are companion material. The optional [Hearts of Steel starter](hearts-of-steel.md) adapts this same pinned CC-BY SRD, with an element-by-element source register and clearly identified companion additions; its attribution is retained inside exported campaigns. Source traceability for implemented rules is recorded in [rules-verification.md](rules-verification.md). Book page numbers, where retained for reader convenience, are not provenance for imported text.

The PDF remains a historical **visual** reference for the user's requested palette and typefaces. Official logo/font downloads and licensed substitute text fonts retain their separate asset provenance in [design-sources.md](design-sources.md). Those assets are not represented as imports from the rules-content repository. User-created campaign references, notes, and assets remain user material.

## Attribution

©2013 Evil Hat Productions, LLC.

This work is based on Fate Core System and Fate Accelerated Edition (found at http://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).

Repository preparation is credited to Randy Oest and the `fate-srd-content` contributors. John Alan Large's separate Markdown edition was reviewed but is not the input used here. The application is an independent companion and does not imply Evil Hat endorsement.

The [official CC guidance](https://fate-srd.com/official-licensing-fate/cc) requires the particular attribution supplied by each SRD used, with copyright text at matching prominence. Additional books require their own notices; the generic Core attribution is not a substitute. The app keeps the required Powered by Fate trademark/logo and Fate Core glyph-font credits in its complete attribution notice.

## Reproducing and updating references

Regenerate from the already-vendored, verified source:

```sh
python3 scripts/import-srd.py
python3 scripts/import-srd.py --check
```

The importer can also accept the path to a local checkout of the pinned repository. It verifies the expected source hashes; it does not scrape websites, download content implicitly, or execute upstream build tools.

For an upstream update, fetch the repository through GitHub or a local Git checkout, select a deliberate commit, review document-level licensing and rule changes, then update the source lock and vendored bytes together. Regenerate content, review the generated diff, and run reference, rules, build, and offline checks. Do not silently replace pinned campaign rules or historical content versions. The [content roadmap](content-roadmap.md) records other upstream documents and the review needed before incorporating them.

Earlier local checkpoints may describe the former CC-BY ZIP import or PDF-based verification work. They are immutable historical handoffs; the source lock and this document describe the current provenance.
