/**
 * Where a run takes place. `track` is the circuit: a road to follow, laps to
 * count, grass beyond the edge line. `free` is the open lot: a slab of
 * asphalt, its edge, and nothing to follow.
 */
export type GameMode = 'track' | 'free';

export const GAME_MODES: readonly GameMode[] = ['track', 'free'];

export function isGameMode(v: unknown): v is GameMode {
  return typeof v === 'string' && (GAME_MODES as readonly string[]).includes(v);
}
