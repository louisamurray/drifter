# Drifter D1: practice flow studies

Date: 19 October 2026. Status: first layout studies, not an interactive prototype or approved implementation.

[Open the D1 studies in Drifter — Design](https://www.figma.com/design/uoKBYYIry5l3BW8FIL2rui/Drifter-%E2%80%94-Design?node-id=10-2).

## Editable screens created

The supplied file was empty before this work. Eight screen frames now sit inside `10:2`, named **D1 — Practice flow — proposed**, on page `0:1`. Every screen uses editable text, layout frames and schematic world geometry; there is no flattened screenshot layer.

| State | Desktop 1280 × 800 | Touch 393 × 852 |
| --- | --- | --- |
| Title / Practice selected | `12:5` | `12:44` |
| Active practice | `12:86` | `12:111` |
| Paused practice | `12:146` | `12:177` |
| Practice overview | `12:211` | `12:239` |

The codebase had no Code Connect files. Inspection found no existing file components, local variable collections or text styles. Connected community libraries were discovered, but searches found no Drifter button, Drifter variables or Archivo styles. These studies use the incumbent game palette and editable layout primitives rather than importing an unrelated product UI kit. They are not a newly published component library.

Figma provides Archivo ExtraBold and Regular, but the installed font list did not expose the bundled Archivo Expanded face by that family name. Typography is therefore an approximation for layout review. Use the existing bundled expanded font when implementing; recheck line lengths then.

## Decisions carried into T4

- Keep Circuit and Free drift and add a clear Practice choice. The Practice title explains that there is no timer; Start practice is the primary action.
- Keep input-scheme selection. The desktop study shows manual keyboard hints without pedals or joystick. The touch study shows the existing two-thumb concepts: gas, handbrake and desired-heading steering. The schematic button positions do not replace the input hit-zone geometry in code.
- Active practice shows activity, Reset and Pause. Remove competitive score, multiplier and timebar. One short cue helps a new player start; no technical telemetry becomes permanent HUD content.
- Reset / R returns directly to the practice spawn, clears rubber for a fresh attempt and remains in practice. Pause freezes the attempt; Resume releases stale input before continuing. Reset practice in pause starts directly, without the timed-run countdown.
- End practice preserves the rubber for an overview. Practice again is primary, Back to title is secondary, and Share drawing remains optional. There is no best-score callout or persistence write.
- Focused actions use an orange outline as well as their filled primary treatment. The shown muted state uses explicit Sound off text. Implementation must preserve keyboard focus and prevent menu actions being consumed by driving controls.
- The car park has been enlarged in web configuration to **2,700 × 3,900 world units**, 50% greater in each direction and 2.25 times the original area. Overview studies reduce the car/rubber/ring scale within the same frame to communicate more space. Active-view car and touch-control sizes stay unchanged. World drawings are schematics, not camera or course geometry specifications.

The physical car, painted skidpad ring, parking-bay dimensions and live camera scale stay unchanged by the car park enlargement. The title demonstration retains a central figure of eight, so extra asphalt does not flatten its turns and remove drifting. The native app's lot is unchanged.

## Review evidence and remaining work

- Inspected the whole eight-screen composition, corrected overview rubber placement, then reviewed the updated overview pair after the requested enlargement.
- Structural checking found no text outside any of the eight screen bounds. This does not establish all internal spacing, target sizes or text-enlargement behaviour.
- All main screens are editable. Primary actions and interruption/recovery paths are visible in the design. No clickable transitions, browser keyboard navigation or screen-reader behaviour are implemented by these studies.
- Remaining D1 validation before T4: one-thumb cue variant, small-height and landscape reflow, long text/text enlargement, actual safe-area and browser-toolbar behaviour, focus order and escape behaviour, reduced-motion treatment, and share-unavailable recovery. Do not infer these from the 393 × 852 static frame.
- Lessons, assistance settings, analogue-controller controls and precision results remain D2/D3 work. The R shortcut and untimed activity are proposed; they do not yet exist in gameplay.

## Stage status

T1's engineering baseline is captured in [handling-baseline.md](2026-10-19-handling-baseline.md). Human baseline, physical-input and device evidence remain pending. D1 has an initial reviewable screen set; its remaining variants are listed above. Next engineering work is **T2**, the isolated force-based solver and its invariants, followed by T3 integration and T4 practice implementation.

Final local checks after the enlargement: lint, typecheck, all **123 tests across 16 files**, production build, changed-code/configuration formatting and documentation links passed. The repository-wide format check still has the four pre-existing iOS failures recorded in the baseline. The scoped Impeccable detector on `src/config.ts` returned no findings. No full browser or physical-device acceptance is implied by those results.
