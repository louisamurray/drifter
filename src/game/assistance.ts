export type AssistanceProfile = 'assisted' | 'reduced';
export function isAssistanceProfile(value: unknown): value is AssistanceProfile {
  return value === 'assisted' || value === 'reduced';
}

/** Device mapping and one-thumb auto-throttle are independent of these driving aids. */
export const ASSISTANCE = {
  assisted: { roadFollowing: 1, cornerBraking: 1, counterSteer: 1 },
  reduced: { roadFollowing: 0, cornerBraking: 0, counterSteer: 0 },
} as const;
