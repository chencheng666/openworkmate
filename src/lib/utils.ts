/**
 * Utility Functions
 * Common utility functions for the application
 */
import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge instance configured for ClawX's custom design tokens.
 *
 * Why this is necessary:
 *   `tailwind-merge` ships with hardcoded knowledge of Tailwind's standard
 *   font-size scale (xs / sm / base / lg / xl / 2xl / ...). It does NOT
 *   read tailwind.config.js, so any custom font-size key we add — e.g.
 *   `text-meta`, `text-tiny`, `text-subtitle`, `text-2xs`, `text-stat` —
 *   is classified by twMerge as a *text color* instead of a font-size.
 *
 *   When that happens, merging shadcn's button variant
 *     `bg-primary text-primary-foreground`
 *   with a caller-supplied class string like
 *     `text-meta font-medium rounded-full ...`
 *   silently *removes* `text-primary-foreground` (twMerge thinks both are
 *   colors and keeps only the later one). The button then has no explicit
 *   text color and falls back to inheriting `text-foreground`, producing
 *   the wrong "blue background + dark text" rendering reported in
 *   https://github.com/<repo>/issues — see the Agents page "Add Agent"
 *   button for a live example before this fix.
 *
 * Fix: extend twMerge's `font-size` class group with our custom token
 * names so it correctly identifies them as font-sizes and stops eating
 * the text color.
 *
 * IMPORTANT: keep this list in sync with `theme.extend.fontSize` in
 * `tailwind.config.js`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['2xs', 'tiny', 'meta', 'subtitle', 'stat'] },
      ],
    },
  },
});

/**
 * Merge class names with Tailwind CSS classes.
 * Uses the ClawX-aware twMerge above so custom font-size tokens
 * (text-2xs / tiny / meta / subtitle / stat) are not mistaken for colors.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getDisplayLocale(locale?: string): string {
  if (locale) return locale;
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'zh-CN';
}

function isChineseLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith('zh');
}

function formatChineseRelativeTime(value: number, unit: 'second' | 'minute' | 'hour' | 'day'): string {
  const abs = Math.abs(value);
  const suffix = value < 0 ? '前' : '后';
  if (unit === 'second' || abs === 0) return '刚刚';

  const unitLabel = {
    minute: '分钟',
    hour: '小时',
    day: '天',
  }[unit];

  return `${abs} ${unitLabel}${suffix}`;
}

/**
 * Format relative time according to the active UI language.
 */
export function formatRelativeTime(date: string | Date, locale?: string): string {
  const now = new Date();
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return '';

  const displayLocale = getDisplayLocale(locale);
  const diffMs = then.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffMs / 60000);
  const diffHour = Math.round(diffMs / 3600000);
  const diffDay = Math.round(diffMs / 86400000);

  if (isChineseLocale(displayLocale)) {
    if (absMs < 60000) return formatChineseRelativeTime(diffSec, 'second');
    if (absMs < 3600000) return formatChineseRelativeTime(diffMin, 'minute');
    if (absMs < 86400000) return formatChineseRelativeTime(diffHour, 'hour');
    if (absMs < 7 * 86400000) return formatChineseRelativeTime(diffDay, 'day');
    return then.toLocaleDateString(displayLocale);
  }

  const formatter = new Intl.RelativeTimeFormat(displayLocale, { numeric: 'auto' });

  if (absMs < 60000) {
    return formatter.format(0, 'second');
  } else if (absMs < 3600000) {
    return formatter.format(diffMin, 'minute');
  } else if (absMs < 86400000) {
    return formatter.format(diffHour, 'hour');
  } else if (absMs < 7 * 86400000) {
    return formatter.format(diffDay, 'day');
  } else {
    return then.toLocaleDateString(displayLocale);
  }
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Delay for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}
