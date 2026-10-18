import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type NavWithSession = Navigator & { audioSession?: { type: string } };

/**
 * The silent media element is only for iOS without the Audio Session API.
 * Where the API exists no element may be created: Brave on iOS offers to add
 * any media element to its Playlist on a long press.
 */
describe('claimPlaybackSession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });

  afterEach(() => {
    delete (navigator as NavWithSession).audioSession;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('uses the Audio Session API when present and adds no media element', async () => {
    const session = { type: 'auto' };
    (navigator as NavWithSession).audioSession = session;
    const { claimPlaybackSession, playbackSessionMode } = await import('./session');
    claimPlaybackSession();
    expect(session.type).toBe('playback');
    expect(playbackSessionMode()).toBe('api');
    expect(document.querySelector('audio')).toBeNull();
  });

  it('falls back to one looping silent element without the API', async () => {
    const { claimPlaybackSession, playbackSessionMode } = await import('./session');
    claimPlaybackSession();
    claimPlaybackSession();
    expect(playbackSessionMode()).toBe('element');
    const elements = document.querySelectorAll('audio');
    expect(elements).toHaveLength(1);
    expect(elements[0]?.loop).toBe(true);
  });

  it('falls back when the API refuses the playback type', async () => {
    const session = {
      get type() {
        return 'auto';
      },
      set type(_v: string) {
        throw new Error('not settable');
      },
    };
    (navigator as NavWithSession).audioSession = session;
    const { claimPlaybackSession, playbackSessionMode } = await import('./session');
    claimPlaybackSession();
    expect(playbackSessionMode()).toBe('element');
    expect(document.querySelectorAll('audio')).toHaveLength(1);
  });
});
