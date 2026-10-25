import { storage } from '#imports';

/**
 * How the follower count is rendered next to a profile.
 * - "full":    "· 1.2K followers"
 * - "compact": "· 1.2K"
 */
export type DisplayMode = 'full' | 'compact';

/** Master switch: when off, XRay adds nothing to the page. */
export const enabledItem = storage.defineItem<boolean>(
  'local:enabled',
  { fallback: true },
);

export const displayModeItem = storage.defineItem<DisplayMode>(
  'local:displayMode',
  { fallback: 'full' },
);

/** Show a badge when an account is younger than the chosen threshold. */
export const newAccountEnabledItem = storage.defineItem<boolean>(
  'local:newAccountEnabled',
  { fallback: false },
);

/** Threshold (in days) under which an account counts as "new". */
export const newAccountDaysItem = storage.defineItem<number>(
  'local:newAccountDays',
  { fallback: 30 },
);

export const NEW_ACCOUNT_OPTIONS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

/** Show a small "Follows you" badge for accounts that follow the viewer. */
export const followsYouEnabledItem = storage.defineItem<boolean>(
  'local:followsYouEnabled',
  { fallback: false },
);

export interface PersonalProfile {
  tags: string[];
  note: string;
  updatedAt: number;
}

export type PersonalProfiles = Record<string, PersonalProfile>;

/** Private tags and notes, keyed by lowercased screen name. */
export const personalProfilesItem = storage.defineItem<PersonalProfiles>(
  'local:personalProfiles',
  { fallback: {} },
);
