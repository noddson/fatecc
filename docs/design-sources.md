# Fate Core visual sources

The supplied `Fate Core Electronic.pdf` is the visual reference. Its cover uses blue, white, and black; its interior uses white pages, strong black geometric headings, thin rules, gray labels, and clipped-corner section markers. The application takes those cues without distributing the book's illustrations. Cover blue `#1d6fa8` is a design approximation of the cover gradient, not an official brand color specification.

## Printable play sheets

The printable character, game-creation, and table worksheets are original React/HTML layouts populated from campaign records. Their black clipped-corner section bars, ruled writing areas, outlined aspect fields, rated stress boxes, and geometric labels follow the book's worksheet design. The supplied book's printed page 297 is the game-creation layout reference. [Evil Hat's official blank Fate Core character sheet](https://evilhat.com/wp-content/uploads/2022/03/Fate-Core-Character-Sheet-Formfillable.pdf), linked from its [Fate Resources page](https://evilhat.com/fate-downloads/), supplies a further structural reference: identity and Fate counters, aspects beside ranked skills, stunts/extras, and stress/consequences. The official blank PDF is a reference and useful standalone download; it is not embedded as the app's print template.

No book illustrations, commercial PDF font subsets, or website rules prose are extracted for these layouts. The rules source remains the pinned GitHub SRD described in [content-sources.md](content-sources.md). Printed headings and prose use the same installed-font preferences and licensed offline substitutes as the app. Each sheet preserves the unmodified Powered by Fate logo and its required attribution.

Printed footers retain the complete prescribed Core/Accelerated attribution, the original copyright notice, and the Powered by Fate trademark/logo credit at a consistent text size. The optional product credit reads **Fate Core supporting game tools by Nick Oddson**, followed by a clickable, paper-readable `noddson.github.io/fatecc` address. The full required attribution is preserved rather than replaced with a shorter notice or a link.

Users reach the preview through **Print sheets** in campaign navigation or **Print** on a character. A4 and US Letter are supported through browser **Print / Save PDF**. Users can select protagonists or NPCs, add the game-creation and table worksheets, and include separate character story pages with connections, notes, personal inventory, and advancement. Layouts expand for long content instead of clipping it into fixed-size fields.

The default **Shared handout** uses the player-safe campaign projection before rendering. Local GMs can deliberately select a **GM copy** that includes private material; player copies cannot request that view. Sheets reflect current saved campaign data (or the open character draft), including current stress, consequences, and Fate points. Pencil changes do not synchronize back to the application and must be entered manually later.

## Welcome banner dice

`public/illustrations/welcome-fate-dice.png` is an original AI-generated illustration approved by the user on 2026-11-06. It shows three separated, stylized Fate dice viewed mostly from above, with plus, minus, and blank faces. The transparent image is displayed at the smaller approved scale over the existing blue gradient, stars, and orbit circles. It is bundled and precached for offline use; it is not official Fate artwork or extracted from the rulebook.

## Lantern Coast example map

`public/sample/lantern-coast.png` is an original AI-generated map created for this application's example campaign on 2026-11-06. It illustrates the sample's Bellweather Harbor, lighthouse, chandlery, flooded road north, and dark beacon. It is not an official Fate illustration and was not extracted from the rulebook, SRD, or another published adventure. The 1536 × 1024 PNG is preserved without pixel edits; its SHA-256 is `447f2e3c607b3bedd638f419aea9b996b559e242db23ee4b79a372972077594c`.

The app bundles the image for offline caching, then stores its bytes inside the campaign. Five connected travel zones and initial character tokens are editable overlays, separate from the image. The regional zone scale is for exploring this sample coast; the GM can replace or refine it for a close-range conflict.

## Lantern Coast Dark Beacon banner

`public/illustrations/lantern-coast-dark-beacon.png` is an original 2172 × 724 panoramic illustration generated with the built-in ImageGen tool on 2026-11-10, using `public/sample/lantern-coast.png` as the visual reference. It shows the map's unlit stone Dark Beacon and keeper's cottage, rocky coastal headland, offshore islands, wind-bent trees, and a long dry approach toward a narrow flooded crossing cropped at the lower-right edge, southeast of the Beacon. The lantern chamber visibly contains an extinguished dark lamp. Open sea on the left leaves room for a campaign title overlay. This is original companion artwork. The PNG is preserved without pixel edits; its SHA-256 is `4a4f31de44b48baf4625cda343b1ab9ee78a14993611d6a66eb0d2c901d353c2`. The generation and final revision prompts are in [lantern-coast-banner-prompt.txt](lantern-coast-banner-prompt.txt). The app uses it by default for campaigns retaining a map revision with the bundled Lantern Coast image hash, including renamed and existing copies. Custom uploaded banners take priority; no saved-data migration is required.

## Hearts of Steel overview banner

`public/illustrations/hearts-of-steel-riverton.png` is an original 2172 × 724 illustration generated with the built-in ImageGen tool on 2026-11-09. It interprets the starter's description of Riverton as a medieval trading city at two rivers: working quays, merchant houses, market awnings, barges, and a stone bridge at dusk. It is atmospheric companion artwork, not official Fate artwork or a canonical map of Riverton. The exact generation prompt is preserved in [riverton-banner-prompt.txt](riverton-banner-prompt.txt). The unchanged PNG has SHA-256 `8e92af6531d52a8515fbd7b35d87b43cf49bdc3320fb7fb40602768de5a95b5f`.

The app bundles and precaches the banner. The overview and campaign card use it by default for campaigns containing the Hearts of Steel source-credit entry, including existing, renamed, and duplicated copies. An uploaded campaign banner takes priority; removing it returns to the Riverton default. No saved campaign migration is required. Other campaigns retain their existing default artwork.

## Riverton town map

`public/sample/hearts-of-steel-riverton-map.png` is an original 1536 × 1024 AI-generated map created with the built-in ImageGen tool on 2026-11-09. It revises the initial town map using `public/illustrations/hearts-of-steel-riverton.png` as the visual reference: wooded western riverbank, projecting stone quays and merchant quarter, main stone bridge over the eastern branch, eastern waterfront, and dense slate-roof town extending inland. It is an elevated illustrated town map and an original companion interpretation, not official Fate geography. Market Square, Old Bridge, and the shop’s placement are companion additions. The exact revision prompt and reference-image roles are in [riverton-map-prompt.txt](riverton-map-prompt.txt).

The unchanged PNG has SHA-256 `24795fe2d40896f541419ca4affdd59a871b48f3f125f73388476498943fb751`. New Hearts of Steel starters load and verify the precached image, then embed it as a shared map asset with an initial revision and no overlays. The map travels in both GM and player JSON/ZIP backups. Existing campaigns can upload the bundled PNG without replacing their maps or campaign data.

## Font identification

The PDF's page font-resource dictionaries identify **Gotham** for headings, labels, and examples, and **Adobe Garamond Pro** for most prose. The following counts are the number of pages with each font listed in their resources, after removing subset prefixes. They are not glyph counts or a measurement of how much text each face sets.

| PDF font name           | Pages with font resource |
| ----------------------- | -----------------------: |
| Gotham-Bold             |                      272 |
| AGaramondPro-Regular    |                      247 |
| Gotham-Medium           |                      237 |
| AGaramondPro-Bold       |                      159 |
| Gotham-Black            |                      128 |
| Gotham-Light            |                      101 |
| AGaramondPro-Italic     |                       81 |
| Gotham-BoldItalic       |                       69 |
| Gotham-Ultra            |                       61 |
| AGaramondPro-BoldItalic |                       50 |
| FateCoreGlyphs          |                       31 |
| GFYThornesmith-Regular  |                       29 |
| Gotham-MediumItalic     |                       28 |
| Gotham-BookItalic       |                        9 |
| Gotham-Book             |                        3 |
| Gotham-LightItalic      |                        3 |

Visual inspection covered the cover, printed page 48 (stunts and refresh), and printed page 297 (game creation worksheet). Temporary review renders are in `tmp/pdfs/fate-design-cover.png`, `fate-design-interior.png`, and `fate-design-sheet.png`; these are not application assets.

Gotham and Adobe Garamond Pro are commercial families. No redistribution or self-hosting license for their text fonts was supplied with this project. Their PDF subsets were **not extracted**. The [Gotham foundry page](https://www.typography.com/fonts/gotham/styles/gotham) and [Adobe Garamond family page](https://fonts.adobe.com/fonts/adobe-garamond/) identify the original families. [Adobe's web-font terms](https://helpx.adobe.com/fonts/web/font-licensing/webfont-licensing.html) distinguish its hosted service from a separate license required for self-hosting.

The application can prefer locally installed Gotham and Adobe Garamond Pro. Its bundled offline alternatives are **Montserrat** for geometric headings and controls and **EB Garamond** for prose. These are visual substitutes, not the exact PDF text fonts. Installing an appropriately licensed exact family can improve the match on that computer; redistributing exact web-font files would require permission covering that use.

## Bundled open text fonts

The four unmodified Latin-subset variable WOFF2 files came from Google Fonts' official `fonts.gstatic.com` delivery URLs, selected through its CSS API. They are served locally by the application, without contacting Google at runtime.

| Local file                                     | Available styles/weights | License     |
| ---------------------------------------------- | ------------------------ | ----------- |
| `public/fonts/Montserrat-Variable.woff2`       | Normal, 100–900          | SIL OFL 1.1 |
| `public/fonts/Montserrat-VariableItalic.woff2` | Italic, 100–900          | SIL OFL 1.1 |
| `public/fonts/EBGaramond-Variable.woff2`       | Normal, 400–800          | SIL OFL 1.1 |
| `public/fonts/EBGaramond-VariableItalic.woff2` | Italic, 400–800          | SIL OFL 1.1 |

The complete copyright notices and licenses accompany them in `public/fonts/LICENSE-Montserrat.txt` and `public/fonts/LICENSE-EBGaramond.txt`, obtained from the official [Montserrat license](https://github.com/google/fonts/blob/main/ofl/montserrat/OFL.txt) and [EB Garamond license](https://github.com/google/fonts/blob/main/ofl/ebgaramond/OFL.txt). Characters outside the bundled subsets use the browser's fallback fonts.

## Official logo and glyph font

The [official Fate licensing page](https://fate-srd.com/official-licensing-fate) expressly offers the **Powered by Fate** logo and Fate Core glyph font with attribution. That permission is distinct from using other Fate or Evil Hat logos. The [Creative Commons guidance](https://fate-srd.com/official-licensing-fate/cc) directs creators to obtain permission for those other marks.

`public/branding/powered-by-fate-dark.svg` is the original white logo intended for a dark background. `public/branding/powered-by-fate-light.svg` is the original black logo intended for a light background. Both are unmodified SVG bytes from the official logo ZIP. Preserve the entire design and its aspect ratio; do not recolor, crop, distort, or show only part of it. The full permission and required trademark credit are in `public/branding/LICENSE-Powered-by-Fate.txt`.

`public/fonts/Fate-Core-Font.ttf` is the unmodified font from the official glyph-font ZIP. It supplies the Fate dice faces, four action symbols, and numbered stress boxes; it is **not** the book's prose font. Its required credit is preserved in `public/fonts/LICENSE-Fate-Core-Font.txt`. The application attribution includes both official credits.

Both required credits appear beneath **Rules Attribution** in the desktop left navigation, below **About Fate Core**. On mobile (760px and narrower), only the **Rules Attribution** control is shown there; the credit paragraphs are hidden. That control opens a formatted, offline-available dialog with logo and font credits, linked sources, and the complete license notice on all screen sizes. The footer does not repeat the attribution control. The dialog and sidebar read the existing `src/content/LICENSE.txt` notice; `public/LICENSE-SRD.txt` remains available as a plain-text download.

Exact download URLs, archive member names, byte sizes, and SHA-256 checksums are recorded in [design-assets.json](design-assets.json). The logo and glyph font bytes were compared with their original archive members; all four text fonts were checked for valid WOFF2 signatures. Assets and licenses were retrieved on 2026-11-06.

## PWA installation icons

The square installation icons frame the complete official white Powered by Fate logo on an opaque `#175c8b` background. The logo is centered, scaled proportionally to 75% of the square's width, and surrounded by generous clear space. Its original colors, shapes, and proportions are preserved; nothing is cropped, redrawn, or recolored. The source SVG remains unchanged.

The reproducible generator is `scripts/generate-app-icons.mjs`. It embeds the original SVG bytes as an image inside a separate square SVG wrapper and uses Chromium's SVG renderer through the project's existing Playwright dependency. Run it with:

```sh
node scripts/generate-app-icons.mjs
```

If Chromium is installed at a custom location, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to that executable. The generator requires no server or network access. It writes:

- `public/branding/app-icon-192.png` — 192 × 192 pixels.
- `public/branding/app-icon-512.png` — 512 × 512 pixels.
- `public/branding/apple-touch-icon.png` — 180 × 180 pixels.

[design-generated-assets.json](design-generated-assets.json) records the renderer version, framing parameters, original SVG checksum, output dimensions, and output checksums. PNG dimensions are checked by the generator. The generated 512px and 192px images were also visually inspected to confirm the complete logo is visible with clear space on every side.
