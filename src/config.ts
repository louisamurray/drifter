/**
 * All tunables in one place. Physics values arrive in milestone 1;
 * palette and loop timing live here from the start so on-device tuning
 * never needs a rebuild.
 */
export const config = {
  loop: {
    /** Physics step in seconds. 60 Hz regardless of display refresh rate. */
    fixedDt: 1 / 60,
    /** Clamp for a single frame's elapsed time so a tab switch cannot spiral. */
    maxFrameDt: 0.25,
  },
  render: {
    /** Cap devicePixelRatio to protect frame rate on 3x phones. */
    maxDpr: 2,
  },
  palette: {
    asphalt: '#1c2230',
    edgeLine: '#e8dcc4',
    offTrack: '#4a5238',
    skid: 'rgba(12, 10, 8, 0.7)',
    accent: '#ff5a2d',
    hudText: '#f2eee6',
  },
} as const;

export type Config = typeof config;
