# Small object illustrations

Current direction: one small, related object per decoration. No landscapes, people, buffalo
scenes or architecture inside small page/card frames. The buffalo remains the primary brand logo.
Earlier scene assets and their generation history are archived in `docs/design/landscape-archive/`
and removed from the runtime public directory.

All ten assets are optimized **384 × 384 WebP, 1:1**, with genuine alpha transparency and complete
uncropped silhouettes. Intended display sizes are 48–96px in cards/headers and up to 128px for
empty states. Palette: fine cobalt contours, white ink, light-blue stippled shading and small
orange accents. No CSS blending, backing rectangle, masks or theme-specific filters are required.
Both light and dark themes use the same asset. Text, values, status badges and calendar dates
remain real UI elements; objects are decorative and never replace explicit labels.

| Identifier | Filename               | Intended component                       | Meaning                         | Composition                       |
| ---------- | ---------------------- | ---------------------------------------- | ------------------------------- | --------------------------------- |
| cloud      | objects/cloud.webp     | Idle worker; Board context; empty states | Quiet/idle/empty                | One curled cloud                  |
| gear       | objects/gear.webp      | Running worker/run; run-count metric     | Work in progress / run category | One gear                          |
| hourglass  | objects/hourglass.webp | Paused worker/project; stopped run       | Held/stopped work               | One hourglass                     |
| loupe      | objects/loupe.webp     | Review header/run; review metric         | Inspection/review               | One magnifying glass              |
| clock      | objects/clock.webp     | Project schedules header                 | Recurring/scheduled work        | One hanging clock, no numerals    |
| wheel      | objects/wheel.webp     | Failed run                               | Failure                         | One broken wheel                  |
| rice       | objects/rice.webp      | Successful run; completed metric         | Completed work                  | One tied rice bundle              |
| calendar   | objects/calendar.webp  | Calendar page header                     | Calendar category               | One hanging calendar, blank cells |
| toolbox    | objects/toolbox.webp   | Settings/project headers                 | Configuration                   | One closed toolbox                |
| coin       | objects/coin.webp      | Cost metric                              | Cost category                   | One coin, no currency symbol      |

## Generation

Generated with built-in imagegen as a coordinated set. Original 1254 × 1254 PNGs were resized to
384 × 384 and encoded as WebP at quality 85. Alpha is preserved. All asset silhouettes were
checked to fit inside the canvas. No prompt labels, numerals or UI controls are baked into art.

Shared prompt followed by the object-specific subject:

> Use case: illustration-story. Asset: ONE small decorative object for kammacron software cards, not a functional UI icon. Create a single isolated object, centered, square 1:1 canvas, genuinely TRANSPARENT background with generous 12% transparent margins on all four sides. Style consistent across the set: delicate hand-drawn cobalt blue contour linework, luminous white ink fills, very light sky-blue stippled shading, restrained Risograph/woodcut grain, tiny vivid orange accents. Thai editorial printmaking aesthetic, airy, peaceful, finely crafted but SIMPLE and readable at only 48–96px. Dominant cobalt #2449C4 / #0649B5, pure white, light blue, sparse #FF7417 orange. Minimize ink coverage and visual weight. Object must be complete and freestanding with organic contour and no crop. Strictly no people, buffalo, animals, architecture, temple, pavilion, landscape, trees, rice fields, scenery, surrounding composition, piles of multiple objects, decorative background, solid sky, backing tile, circle badge, rectangular frame, drop shadow, neon glow or glossy 3D. No text, letters, words, numerals, logos or UI. Fine traditional Thai engraving flourishes may be integrated sparingly INTO the object itself, never as a surrounding scene.

| Identifier | Subject prompt                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cloud      | ONE small peaceful fluffy cloud with a gently curled Thai cloud contour. White body, a few cobalt contour strokes, pale blue stippled underside; one tiny orange accent. No sun, moon, rain or lightning.                                                                        |
| gear       | ONE mechanical gear wheel, three-quarter view, clean cobalt rim and white faces with a small orange central hub. Only one gear, no extra gears or surrounding machinery. Represents work in progress.                                                                            |
| hourglass  | ONE simple hourglass held in a slim cobalt frame, white glass with pale-blue contours and a small amount of orange sand. No hands, no people, no table. Represents work held / stopped.                                                                                          |
| loupe      | ONE magnifying glass with a cobalt outline and white/light-blue lens and a small orange handle accent. No paper, check mark, person, desk or other objects. Represents inspection/review.                                                                                        |
| clock      | ONE small hanging mechanical clock, cobalt casing, white round dial, simple cobalt hands and orange radial tick marks. No numerals, no pendulum scene, no surrounding architecture. Represents scheduled recurring work.                                                         |
| wheel      | ONE broken wooden cart wheel lying at a slight angle. A visibly broken spoke and split rim are part of this single wheel. Cobalt fine contours, white/light-blue wood faces, a tiny orange hub accent. No cart, no buffalo, no loose debris or landscape.                        |
| rice       | ONE compact tied sheaf of harvested rice, a single bundled object. Fine cobalt grain heads and white/light-blue stalks, small orange binding ribbon. No fields, basket, cart or other props. Represents completed work.                                                          |
| calendar   | ONE hanging tear-off wall calendar, slightly three-quarter view, cobalt wire loop and top binding, white paper with a light-blue grid of empty cells and one small orange highlighted cell. No letters, weekday names, dates or numerals. No actual wall or surrounding objects. |
| toolbox    | ONE compact traditional wooden toolbox as a single closed object, slightly three-quarter view, cobalt handle/contours, white/light-blue panels, one small orange latch. No loose tools, no workshop, no floor or scene.                                                          |
| coin       | ONE coin, slightly tilted with a cobalt rim, white/light-blue face and a small orange center engraving. No currency symbol, text, numbers, coin pile, wallet or background. Represents cost.                                                                                     |
