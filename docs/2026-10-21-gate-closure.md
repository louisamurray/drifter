# Closing Gates 1–4: playtest kit, design check and release state

Date: 21 October 2026
Status: the kit is ready and nothing in it has been recorded yet. Gates 1–4 stay open until the owner's runs are recorded, and parts of Gates 2–4 stay open after that, because they need other players and other hardware.

Follows the [T4, T6–T11 evidence](2026-10-19-activities-t4-t11.md). Every engineering check in Phases 1–4 passes there; what remains is human and hardware evidence.

## Release state

`main` is deployed to GitHub Pages. The deploy at `a90ffdc` succeeded, and the last change to game code is `87c5469`. The later commits change only docs, so every result recorded against the live build is a result for `87c5469`. T11's "deploying awaits the owner" is resolved.

## Who and what is available

The owner is the only tester for now, with a Mac and an iPhone. There is no Android phone, tablet or game controller. So:

- Gate 1's keyboard walkthrough can close.
- Gate 2 and Gate 3 get an experienced player's observations. The moderated comparison with new and experienced players stays open.
- Gate 4's iPhone checks can close. Android, tablet and controller hardware stay open.

## The kit

The [Drifter playtest kit](https://claude.ai/artifact/EwDLwDpyovZvUu1PmJoZ3C) is a private page with one card per check. Each card gives steps, a pass condition, the measures to write down, an outcome and notes. Saved results go to the page's own store, which Claude reads back. The page is visible only to its owner.

| Check | Where | Gate | Decision-log question it answers |
| --- | --- | --- | --- |
| A1 Free drift baseline | Mac, legacy | 1, 2 | Baseline for the comparison |
| A2 Practice walkthrough | Mac, force | 1 | Initiate and catch a slide on the keyboard; reset, pause and exit; no best written |
| A3 Lessons, Assisted | Mac | 2 | Loop size, 4 s switch window, Assisted fading Sustain |
| A4 Lessons, Reduced assistance | Mac | 2 | Sustain and Transition without countersteer |
| A5 Challenge, Assisted | Mac | 3 | Does a result suggest a useful next try? Is it too demanding? Scoring-weight approval |
| A6 Challenge, Reduced assistance | Mac | 3 | Separate best per assistance profile |
| A7 Sound, cues and results | Mac | 4 | Wheelspin cue; results band on short windows |
| B1 Reach and safe areas | iPhone | 4 | Touch reach, safe areas, Reset and Pause |
| B2 Sound on iPhone | iPhone | 4 | Audio unlock, silent switch, lock and resume |
| B3 Frame rate | iPhone, `?debug` | 4 | fps and update and render cost, Practice and Circuit |
| B4 Touch practice and lessons | iPhone | 1, 2 | Slides and lessons on touch |
| B5 One thumb | iPhone | 2 | Auto-throttle described honestly; slide and Initiate |
| B6 Touch challenge | iPhone | 3, 4 | A finished touch attempt saves a best (`87c5469`) |
| B7 Landscape, Home Screen, interruptions | iPhone | 4 | Orientation, standalone launch, background and resume |
| B8 Share drawing | iPhone | 4 | Real share sheet and cancel |

The setup card records which handling came first, the browser, the iPhone model and the iOS version. Each saved card also stores the viewer's user agent and a timestamp.

The deployed build cannot run timed courses on force handling: that selector exists only in the dev server. So the comparison is Free drift (legacy) against Practice (force), on the same lot.

## Design check: D2 eight and D3 course

This resolves the plan's request to check both drawings against the shipped geometry. The check changed nothing in Figma; the D3 redraw that followed is described below.

**D3 course (`s-bend-2`).** The hand matches. In D3.01 and in the game, the first corner bends left and the second bends right. The decision log's first follow-up is answered. The geometry differs in three ways:

| | D3.01 schematic | Shipped `s-bend-2` |
| --- | --- | --- |
| Surface | A road with edges, on grass | A dashed guide line on the open lot, with no edges |
| Shape | Two 90° bends joined by straights, entering and leaving eastwards | One sine period driven upwards, from (0, 1000) to (0, −1000), with no straights. Each corner turns about 103°, between 51° east and 51° west of north. Start and Finish face north-east, and each apex faces north |
| Zones | Clip is a point at the inside apex, and Outer is a strip on the outside edge | Every zone is a gate line 360 units wide, centred on the path. Outer 1 is before the apex, and Clip 1 is at it (x = 400) |

**D2 eight.** The shape matches: two equal loops touching at the crossing, left loop first. The scale does not. In D2.12 the lot ring is close to true scale (286 px for 260 units at the game's resting zoom of 1.1), but the loops have a 120 px radius where 300 units would draw 330 px. So the loops are about 2.75 times too small against the car, and they overlap the ring, when the eight actually sits 900 units below the ring's centre. At the game's zoom of 0.85–1.1, one loop is 510–660 px across, wider than a 393 px phone, so a touch player never sees the whole eight. Check B4 records whether that matters.

Both differences were design choices for the owner. The owner chose to redraw D3 to match the game, and to decide the D2 eight's scale after playtesting.

### D3 redrawn to match the game

D3 was redrawn on 21 October from a designer spec. The old screens are archived, locked, on the `90 Archive` page as "D3 superseded (pre s-bend-2)".

- **Gate component.** `World/Zone` Gate variants now draw one line that stretches to any length: dashed until crossed, cream, or accent when it is the next target. A new Marks property holds the proposed end ticks, active chevrons and missed cross. Every D3 instance has Marks off, so it draws what the game draws. The Clip and Outer variants stay in the library, described as not used by `s-bend-2`.
- **D3.01 schematic.** The S is to scale at 1 px = 3 world units, with north up: guide path, lot ring at the Switch, seven gate lines in sentence-case labels, and the car at the spawn. The legend now reads "Gate states", followed by the order of the gates with their Line awards. The purple annotations name the corners and the transition, and the suggested racing line is gone.
- **In-play screens** (D3.04–D3.08, D3.12, D3.13, D3.21, D3.22, D3.25, D3.27). Open asphalt, with the camera, zoom, car pose, gate states, labels and rubber computed from the game's formulas for each moment. The HUD cue reads as the game does, for example "Next: Switch · slide right", or the loss reason after a miss. Score pops and the transition chevrons are gone, because the challenge draws neither.
- **Results screens** (D3.09–D3.11, D3.14–D3.20, D3.23, D3.24, D3.26, D3.28, D3.29). The whole lot, fitted by the game's overview rule into the space D3 gives the overview. On a phone the S is about 34 × 85 px.

**Still different, left for the owner:**

| Difference | Game | D3 | Where it is decided |
| --- | --- | --- | --- |
| Gate label font | Canvas asks for "Archivo Expanded", which the page never registers, so labels fall back to the default sans | Archivo ExtraBold, as intended | Owner: fix the game (one line, `src/main.ts` lines 729 and 743) |
| Results layout | Breakdown and reason sit inside the score block; the overview takes what is left above the buttons | The overview sits between the score and the breakdown | Decision log: results band, kit A7 |
| Results copy | "Line + Angle + Transition", one reason line, the ruleset identity | "3 of 4 zones", "In range 74%", "Challenge rules 1", a two-line reason | T20 design approval |
| HUD | Activity bar and one cue line, always shown | A Steps row; several screens have no cue; a second cue line | T20 design approval |
| Gate marks and labels | Missed looks like Upcoming apart from its label; the Switch and Outer 2 lines cross their own labels | Same, since Marks are off | Owner: propose marks or label placement to the game, or not |

One finding for playtesting: on a phone just after Clip 1, the active Switch gate is still off screen, because the camera leads the car by only 37 units. Kit checks B4 and B6 will show whether that matters.

## Still open after the kit

- Moderated sessions with new and experienced players, alternating handling order (Gates 2 and 3).
- An Android phone in Chrome and a tablet (Gate 4).
- A physical controller: analogue steering, disconnect and takeover (Gate 4).
- Approval of the D1–D3 designs. D3 now matches the game apart from the differences listed above; the D2 eight waits for playtesting.
- The FigJam dependency diagram, which still needs a team selected in Figma.
