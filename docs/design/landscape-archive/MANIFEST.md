# Illustration assets

Generated with the built-in imagegen tool for kammacron. Files are reusable transparent WebP,
1000 × 500 pixels, aspect ratio **2:1**. Generated PNGs are reduced and encoded at WebP quality 85.
No live text, metrics, labels, numbers or controls are embedded in the images.

All assets support light and dark surfaces through alpha transparency. Do not invert or recolor
images for dark mode. These are decorative companions to explicit labels, not status indicators.
The buffalo specification was supplied in the brief; no original buffalo reference file was present.

| Identifier | Filename     | Intended component                          | State / meaning                            | Composition                                                  |
| ---------- | ------------ | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| idle       | idle.webp    | Runs worker Card; welcome header            | Worker idle; brand on onboarding           | Buffalo bathing in lotus pond, lower right; quiet upper left |
| running    | running.webp | Runs worker Card; run header                | Worker/run running                         | Buffalo plowing rice field, right; rice rows along bottom    |
| paused     | paused.webp  | Worker and project headers                  | Worker paused, run stopped, project paused | Buffalo resting under tropical tree, right                   |
| review     | review.webp  | Review/run headers; review metric           | Awaiting instructions / review             | Buffalo beside loaded harvest cart, right                    |
| clock      | clock.webp   | Calendar/settings headers; run-count metric | Timekeeping / recurring work category      | Mechanical workshop clock, lower right                       |
| failed     | failed.webp  | Run header                                  | Run failed                                 | Cart with broken detached wheel, buffalo nearby              |
| field      | field.webp   | Board/review empty states; project header   | No projects / quiet environmental context  | Uncultivated fields, tropical trees at right                 |
| harvest    | harvest.webp | Run header; completed/cost metrics          | Run succeeded / harvest metric category    | Buffalo delivering sacks on wooden cart, lower right         |

## Current Thai-cloud revision — 2026-11-26

All eight scenes are restyled with built-in imagegen. The first image is each existing kammacron
scene, the second is the user's architecture-and-cloud reference, and the third is konmek's
`apps/shells/public/art/thai-cloud/login.webp`. The two style references are preserved in
`docs/design/thai-cloud-reference.png` and `docs/design/konmek-login-reference.webp`.
Konmek was inspected read-only; its components and application logic are not copied.

Current palette: dominant cobalt contours, pure white architecture/clouds, light-blue stippled
shadows, orange roofs/scarves and small jade vegetation accents. Transparent organic boundaries
remain mandatory. All scenes remain 1000 × 500 WebP and support both themes with real alpha.

Shared style-transfer prompt:

> Use case: style-transfer. Image 1 is the EDIT TARGET, the current kammacron scene. Image 2 is the user's PRIMARY STYLE AND COLOR REFERENCE (Thai architecture among clouds). Image 3 is supporting konmek Thai-cloud architectural linework reference. Restyle Image 1 to the visual language of Image 2, supported by Image 3: detailed hand-drawn Thai architectural editorial print, crisp fine cobalt contour lines, finely stippled sky-blue shadows, luminous PURE WHITE architecture and cloud forms, vivid cobalt water/ink accents, sparse bright ORANGE curved Thai tile roofs and scarf, small restrained jade trees. The predominant pigments must be cobalt BLUE, WHITE, LIGHT BLUE and ORANGE. Reduce muted teal/sage/earth pigments and coarse dense dark engraving. No cream, beige, yellow paper, antique sepia, large dark solid fills, muddy green wash or glossy 3D. Light airy illustrated Thai workshop atmosphere with restrained print grain, delicate architectural details. Adapt existing workshop buildings into clean white Thai pavilions with cobalt trim and orange roof accents; use a few soft organic white/blue cloud tufts around the vignette, NOT a solid sky background. Keep Image 1's actual main scene/action and all important recognizable subjects, never replace state semantics with servers or unrelated buildings. Keep any existing buffalo calm, hardworking, with gear-shaped horns, radial clock halo without numerals and orange-white checkered scarf; render its body with fine cobalt contour and light-blue shading rather than a dark solid blob. Wide horizontal 2:1 composition. Freestanding organic illustration on genuinely TRANSPARENT background with visible transparent margins on ALL FOUR sides. Complete all leaves, roofs, clock halos and ground contours inside the canvas; no chopped objects, no straight-cut crop, no rectangular corners, NO oval badge or white rectangular backing. Quiet upper-left 40% for real HTML content, main subject to the right. No text, numbers, letters, controls, UI or watermark.

Each asset appends `SCENE REQUIREMENTS:` followed by its prompt:

| Identifier | Scene requirements                                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| idle       | The buffalo peacefully BATHES IN A LOTUS POND. Preserve the visible water ripples and lotus so this clearly means idle/rest.                                                                                                        |
| running    | The buffalo actively PLOWS A RICE FIELD with a traditional plow and farmer. Preserve walking legs, harness and planted rows.                                                                                                        |
| paused     | The buffalo is lying RESTING UNDER A TROPICAL TREE. Preserve its resting pose, complete flowering tree canopy and a quiet Thai workshop behind.                                                                                     |
| review     | The buffalo is standing PATIENTLY WAITING BESIDE A LOADED HARVEST CART. Preserve waiting stance, sacks and cart; not walking or working.                                                                                            |
| clock      | A craftsman works at a MECHANICAL CLOCK WORKSHOP. Preserve large clock, exposed gears and bench. Architecture may be a white Thai clock pavilion. No buffalo or animals.                                                            |
| failed     | Buffalo beside a BROKEN WOODEN CART WITH A DETACHED BROKEN WHEEL clearly lying on the ground. Preserve the broken wheel as the main failure metaphor; do not repair or obscure it.                                                  |
| field      | EMPTY UNCULTIVATED RICE FIELD with quiet trees, water channels and a small distant white Thai pavilion. Absolutely NO buffalo, NO people, NO animals, NO cart, NO harvest sacks, NO clock. This scene explicitly means no projects. |
| harvest    | The buffalo is DELIVERING HARVESTED CROPS IN A WOODEN CART. Preserve forward walking pose, full intact cart and harvested sacks.                                                                                                    |

## Original generation prompts (superseded by the Thai-cloud revision above)

Each prompt combines the scene below with this shared direction. Individual calls repeated the
same palette, composition, character and exclusions; scene wording is retained here for reuse.

> Contemporary Thai folk art editorial illustration combining traditional woodcut engraving,
> linocut printmaking, Risograph printing, and textured gouache. Organic hand-drawn silhouettes,
> expressive ink linework, delicate cross-hatching, tactile halftone grain, subtle ink imperfections,
> flat pigment colors, stylized tropical vegetation, poetic rural Thai visual storytelling.
> Cobalt #0649B5, orange #FF7417, pure white; optional muted teal, jade, sage, earth brown, pale gold,
> lotus coral. Peaceful, contemplative, grounded, hardworking, nostalgic and quietly beautiful.
> Reusable wide 2:1 dashboard asset on transparent background. Main subject toward lower-right,
> upper-left 40–50% empty for live HTML content. All objects must finish inside the canvas with
> transparent margins on every side. Use irregular, organic foliage, earth and water silhouettes;
> no straight-cut edges or rectangular corners, including at the bottom and right.
> Mascot: calm Thai water buffalo, mechanical gear-shaped curved horns, clock hands and radial
> clock halo without numerals, traditional orange-and-white checkered Thai scarf.
> No text, numbers, typography, buttons, UI mockup, watermark, photorealism or glossy 3D.

| Identifier | Scene prompt                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| idle       | Calm hardworking Thai water buffalo peacefully bathing in a lotus pond; tropical reeds, lotus and field contour lines along bottom edge.                                                                  |
| running    | Buffalo plowing a rice field, pulling a traditional plow along planted rice rows.                                                                                                                         |
| paused     | Buffalo resting peacefully under a tropical tree, folded legs, quiet rural workshop far behind.                                                                                                           |
| review     | Buffalo standing patiently beside a wooden cart full of harvested rice sacks, waiting for its next instruction.                                                                                           |
| clock      | Traditional mechanical clock with exposed gear wheels on a rural workshop bench, rice leaves at lower edge. No buffalo required. Clock face radial marks only, no numbers.                                |
| failed     | Wooden harvest cart with a visibly broken detached wheel, buffalo standing calmly nearby, tropical grasses along lower edge.                                                                              |
| field      | Empty Thai rice field waiting to be cultivated. No buffalo, no cart. Quiet tropical trees at far right, water channels and patterned field rows along bottom.                                             |
| harvest    | Thai water buffalo delivering harvested rice sacks in a wooden cart. Calm hardworking mascot with gear-shaped horns, radial clock halo with hands and no numerals, orange-and-white checkered Thai scarf. |

For a new scene, use a current buffalo illustration as a character reference and retain the shared
direction. Register the asset centrally before adding a consumer. Only map a state that actually
exists in the application's authoritative data; retain its explicit accessible label.

## Organic-boundary revision — 2026-11-26

All eight original scenes were edited with built-in imagegen, using their own original WebP as
the edit target. Subject, state meaning, palette and printmaking style are preserved. Decorative
scenes must be complete freestanding silhouettes rather than rectangular landscape crops.

Shared edit prompt, applied once to each asset:

> undefined

Field-only correction prompt: Remove the buffalo, clock halo, scarf, animals, people, carts,
sacks and harvested crops. Replace their area with an empty uncultivated rice field and quiet
tropical vegetation. Preserve the organic freestanding outline, transparent margins, complete
palm and flowering tree silhouettes, wide 2:1 canvas, quiet upper-left space, Thai woodcut/Risograph
grain and cobalt/orange/teal/jade palette. No straight-cut edges, corners, frame, backing, text or UI.
