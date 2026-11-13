# Cirrus Skimmer artwork prompts

Created with the built-in ImageGen tool on 2026-11-13. The regional geography and artwork are original companion material, not official Fate SRD artwork. The selected files are intended for `public/sample/cirrus-skimmer-sea-of-clouds.png` and `public/illustrations/cirrus-skimmer-sea-of-clouds.png`.

## Initial regional chart

```text
Use case: illustration-story
Asset type: regional campaign map for the Cirrus Skimmer tabletop RPG example.
Create a polished, richly illustrated overhead regional navigation chart titled "SEA OF CLOUDS", landscape 3:2, ideally 1536 x 1024. This is a true straight-down regional map, not an oblique landscape: a vast ocean of billowing ivory clouds with floating rocky islands and aerial routes, no ordinary ocean or ground coastline. Hand-inked fantasy cartography with delicate contours, finely painted cloud swirls, muted teal and blue-grey washes, subtle aged ivory parchment, readable dark ink serif labels, and a thin understated border; the detail and craftsmanship of a beautiful illustrated tabletop campaign map.
Geography, arranged for play:
- "Cloudbreak Anchorage" at east-center, around 76% across and 45% down: the main crescent-shaped floating island, compact clustered slate-roof houses, a sheltered inward curve, wooden skyship docks projecting over the clouds, and a small pale stone beacon with a teal glass lantern.
- "Glasswind Spires" at northeast, around 77% across and 19% down: a cluster of slender floating stone pinnacles.
- "Stormwall" at north-center, around 51% across and 23% down: an unmistakable dark curling storm front.
- "Patrol Reach" at west-center, around 23% across and 38% down: scattered rocky islets and an open passage through cloud banks.
- "Trade Winds Reach" near the center, around 49% across and 55% down: an open winding flight corridor indicated by subtle wind arrows.
- "The Quiet Shoals" at southwest, around 25% across and 75% down: small peaceful floating islets in a soft bank of clouds.
- "Lower Cloud Sea" at southeast, around 73% across and 78% down: broad, deep cloud banks with few landmarks.
Use those exact seven place labels, set legibly beside their features without collisions. Put the title in a modest cartouche at upper left and a small compass rose at lower left. Draw a few fine dotted navigation routes linking the Quiet Shoals to Trade Winds Reach to Cloudbreak, and Patrol Reach to the Stormwall edge; leave open space for movable game tokens. Keep the islands clearly floating above clouds but use a cartographic top-down view throughout. No characters, fixed player ship, game UI, numbers, hex grid, stat blocks, additional invented place names, or logos. Make it inviting and highly usable as a regional travel map.
```

## Chart perspective refinement

The initial generated chart is the edit target; all labels and geography are preserved. Only the final refined chart is shipped.

```text
Use case: precise-object-edit
Asset type: overhead regional tabletop map.
Edit the provided Sea of Clouds map to make the geography a STRICT STRAIGHT-DOWN BIRD'S-EYE PLAN VIEW. Keep the same landscape canvas, all seven exact place names, their locations, navigation routes, cloud patterns, teal/ivory palette, cartouche, compass rose, and ink-and-watercolor craftsmanship.
Change only perspective: show the floating islands as flat top-down outlines and top surfaces; do not show tall vertical cliff faces, hanging roots, undersides, or isometric side views. Cloudbreak Anchorage must be seen directly from above: a crescent-shaped island, slate roof plans, a curved sheltered skyship harbor, docking arms, and the circular top of its teal-glass beacon. Show the Glasswind Spires as small top-down rock footprints among clouds. Keep clouds as the surrounding sea with subtle shadow rings suggesting islands float, without an eye-level horizon.
Preserve readable spelling and these exact labels: "SEA OF CLOUDS", "Cloudbreak Anchorage", "Glasswind Spires", "Stormwall", "Patrol Reach", "Trade Winds Reach", "The Quiet Shoals", "Lower Cloud Sea". No extra names, ships, characters, UI, hex grid or logos.
```

## Companion banner — initial generation

Input 1: the generated regional chart as a geography reference. Input 2: `public/illustrations/lantern-coast-dark-beacon.png` as a style reference. Input 3: `public/illustrations/hearts-of-steel-riverton.png` as a style reference. The existing banners remain unchanged.

```text
Use case: illustration-story
Asset type: panoramic campaign overview and selection-card banner for Cirrus Skimmer.
Input images: Image 1 is a GEOGRAPHY REFERENCE, the Sea of Clouds regional map. Images 2 and 3 are STYLE REFERENCES ONLY, the existing Lantern Coast and Hearts of Steel banners. Create a new panoramic scene; do not copy their lighthouse coast, town, terrain, or text.
Make an original, richly painted fantasy adventure banner, very wide 3:1 composition, ideally 2172 x 724 pixels, matching the craftsmanship and believable painterly detail of the two reference banners.
Scene: the wooden two-masted skyship Cirrus Skimmer sailing above an immense luminous sea of ivory clouds, approaching Cloudbreak Anchorage. The ship is an elegant small sailing vessel with a warm weathered wooden hull, rope rigging, brass fittings and muted teal sails; no balloon, modern plane, propellers or sci-fi hull. Show the complete ship near 58% across the frame, with generous breathing room above all mast tips and below the hull. The right side contains the SAME crescent-shaped floating island harbor from the regional map: clustered slate-roof houses, wooden skyship docks along the sheltered inward curve, and a pale stone beacon with a soft teal glass light. Distant narrow Glasswind Spires rise behind the harbor; a dark Stormwall curls along the far-left horizon.
Composition: cinematic wide view from another skyship above the clouds. Keep the left third predominantly atmospheric teal-blue clouds and darker open sky, allowing the app to overlay its heading there. Important subjects sit within the central safe area and are not clipped by the frame or a modest vertical crop. The ship and approaching port should feel connected to the illustrated map, with the same island shape, roofs, dock design and beacon.
Lighting: late-afternoon light breaking through cloud, cool teal shadows, warm subtle golden light on the sails, roofs and cloud edges. Adventurous and inviting with looming weather, not horror. Detailed hand-painted realism, like the existing two banners, not a cartoon or map.
No text, captions, lettering, border, logo, watermark, game UI or portrait characters.
```

## Banner ship-scale correction — selected final

The initial banner is the edit target. The ship was too large relative to the island and houses; the selected final preserves the port and reduces the vessel to a modest visiting craft. This edit used the built-in ImageGen tool.

```text
Use case: precise-object-edit
Asset type: panoramic Cirrus Skimmer campaign banner, 2172 x 724, 3:1.
Input image: the existing banner is the EDIT TARGET.
Primary request: correct the oversized skyship relative to Cloudbreak Anchorage. Shrink the ENTIRE ship (hull, both masts, sails, rigging, flags and lantern) to about 30 percent of its CURRENT linear dimensions. Its complete silhouette should occupy only about 160 pixels of this 2172-pixel-wide canvas. Hull length should be roughly three neighboring house-widths, around 110–130 pixels, while the island retains its current approximately 600-pixel extent. The harbor must plausibly accommodate several ships of this size.
Place the smaller complete vessel around 58 percent across and 64 percent down, in the open flight corridor leading toward the harbor, at a similar apparent distance as the docks. Keep it clearly identifiable as the SAME elegant wooden two-masted vessel with muted teal sails. Restore the cloudscape seamlessly where the large ship used to be. The anchorage should read as a substantial inhabited island port; the ship is a modest visiting craft, not a giant foreground vessel.
Invariants: keep the island and harbor, crescent shape, all buildings and slate roofs, wooden docks, teal beacon, distant Glasswind Spires, left Stormwall, cloud-sea, lighting, painterly detail, warm golden highlights, cool teal shadows, camera viewpoint, panoramic dimensions, and empty left third for app copy unchanged. Change only the vessel scale/placement and the cloudscape revealed behind its old footprint. Do not enlarge the ship through foreground forced perspective. No extra ships, characters, lettering, captions, borders, logo, or UI.
```
