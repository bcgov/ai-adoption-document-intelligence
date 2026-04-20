/**
 * Shared normalization for common form field keys (SIN, phone, dates).
 * Used by OCR field normalization and schema-aware evaluation so formatting
 * differences do not count as content errors when the underlying value matches.
 */

const MONTH_ABBREV = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Field keys like `sin`, `spouse_phone`, `applicant_sin` (underscore before suffix). */
const IDENTIFIER_FIELD_KEY = /^(?:.+_)?(?:sin|phone)$/i;

/**
 * Field keys whose values are calendar dates in ground truth: `date`, `*_date`
 * (underscore before the `date` suffix). Does not match camelCase `*Date` keys.
 */
const DATE_FIELD_KEY = /^(?:date|.+_date)$/i;

export interface CalendarParts {
  y: number;
  m: number;
  day: number;
}

export function isIdentifierLikeFieldKey(fieldKey: string): boolean {
  return IDENTIFIER_FIELD_KEY.test(fieldKey);
}

export function isDateLikeFieldKey(fieldKey: string): boolean {
  return DATE_FIELD_KEY.test(fieldKey);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidYmd(y: number, m: number, day: number): CalendarParts | null {
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return { y, m, day };
}

function tryDayMonthYear(
  d: number,
  mon: number,
  y: number,
): CalendarParts | null {
  return isValidYmd(y, mon, d);
}

/**
 * Parse slash/dot/dash numeric triplet: DD/MM/YYYY vs MM/DD/YYYY when ambiguous.
 */
function parseNumericTripletDate(
  aStr: string,
  bStr: string,
  yStr: string,
): CalendarParts | null {
  const a = parseInt(aStr, 10);
  const b = parseInt(bStr, 10);
  let y = parseInt(yStr, 10);
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(y)) return null;
  if (yStr.length === 2) y += y >= 70 ? 1900 : 2000;

  if (a > 12) return tryDayMonthYear(a, b, y);
  if (b > 12) return tryDayMonthYear(b, a, y);
  const dmy = tryDayMonthYear(a, b, y);
  if (dmy) return dmy;
  return tryDayMonthYear(b, a, y);
}

/**
 * Parse a single date string to calendar parts in UTC, or null if not parseable.
 */
export function parseToCalendarParts(value: string): CalendarParts | null {
  const s = value.trim();
  if (!s) return null;

  const named = s.match(/^(\d{4})-([A-Za-z]{3,9})-(\d{1,2})$/);
  if (named) {
    const y = parseInt(named[1], 10);
    const mon = MONTH_NAME_TO_NUM[named[2].toLowerCase()];
    const day = parseInt(named[3], 10);
    if (!mon || Number.isNaN(y) || Number.isNaN(day)) return null;
    return isValidYmd(y, mon, day);
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    return isValidYmd(y, m, day);
  }

  const triplet = s.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{2,4})$/);
  if (triplet) {
    return parseNumericTripletDate(triplet[1], triplet[3], triplet[4]);
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return isValidYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  return null;
}

/** Ground-truth style used in benchmarks: `2016-Mar-30`. */
export function formatCanonicalDateLabel(parts: CalendarParts): string {
  const mon = MONTH_ABBREV[parts.m - 1];
  return `${parts.y}-${mon}-${String(parts.day).padStart(2, "0")}`;
}

export function tryCanonicalDateString(value: string): string | null {
  const parts = parseToCalendarParts(value);
  if (!parts) return null;
  return formatCanonicalDateLabel(parts);
}

/**
 * OCR often drops a lone currency symbol or punctuation on an unfilled date line.
 * When there is no digit and no parseable date, treat as blank for `date` / `*_date` keys.
 */
export function shouldCoerceDateFieldNoiseToEmpty(value: string): boolean {
  const t = value.trim();
  if (t.length === 0) return false;
  if (tryCanonicalDateString(value) !== null) return false;
  if (/\d/.test(t)) return false;
  if (t.length <= 3) return true;
  return /^[\s\W_]+$/u.test(t);
}
