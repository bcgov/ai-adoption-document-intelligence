/** A seeded random number generator returning values in [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast and deterministic. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of "<form>#<copy>", so each copy gets its own stable values. */
export function seedFor(formId: string, copy: number): number {
  let hash = 2166136261;
  for (const char of `${formId}#${copy}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const FIRST_NAMES = [
  "Avery",
  "Jordan",
  "Priya",
  "Liam",
  "Mei",
  "Noah",
  "Amara",
  "Ethan",
  "Sofia",
  "Kai",
  "Harper",
  "Mateo",
  "Leila",
  "Owen",
  "Zoe",
  "Arjun",
] as const;
const LAST_NAMES = [
  "Nguyen",
  "Singh",
  "MacDonald",
  "Tremblay",
  "Chen",
  "Wilson",
  "Gill",
  "Roy",
  "Campbell",
  "Dhillon",
  "Park",
  "Moreau",
  "Brown",
  "Sandhu",
  "Lee",
  "Martin",
] as const;
const STREETS = [
  "Douglas Street",
  "Kingsway",
  "Granville Street",
  "Fort Street",
  "Main Street",
  "Oak Bay Avenue",
  "Hastings Street",
  "Lakeshore Road",
  "Cook Street",
  "Marine Drive",
] as const;
const CITIES = [
  "Victoria",
  "Vancouver",
  "Kelowna",
  "Kamloops",
  "Nanaimo",
  "Prince George",
  "Surrey",
  "Burnaby",
  "Abbotsford",
  "Courtenay",
] as const;
const WORDS = [
  "hearing",
  "order",
  "payment",
  "notice",
  "tenant",
  "agreement",
  "schedule",
  "service",
  "review",
  "claim",
  "evidence",
  "matter",
  "account",
  "request",
  "support",
  "date",
  "copy",
  "record",
  "court",
  "party",
] as const;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function digits(count: number, rng: Rng): string {
  return Array.from({ length: count }, () => Math.floor(rng() * 10)).join("");
}

function postalCode(rng: Rng): string {
  const letters = "ABCEGHJKLMNPRSTVXY";
  const letter = () => letters[Math.floor(rng() * letters.length)];
  return `V${digits(1, rng)}${letter()} ${digits(1, rng)}${letter()}${digits(1, rng)}`;
}

function dateValue(rng: Rng): string {
  const year = 2024 + Math.floor(rng() * 3);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function amount(rng: Rng): string {
  const dollars = 10 + Math.floor(rng() * 9990);
  return `${dollars.toLocaleString("en-CA")}.${digits(2, rng)}`;
}

function sentence(wordCount: number, rng: Rng): string {
  const words = Array.from({ length: wordCount }, () => pick(WORDS, rng));
  const text = words.join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** A made-up value shaped by the field's name, cut to its maximum length. */
export function valueFor(
  fieldName: string,
  multiline: boolean,
  maxLength: number | undefined,
  rng: Rng,
): string {
  const name = fieldName.toLowerCase();
  let value: string;
  if (/e-?mail/.test(name)) {
    value = `${pick(FIRST_NAMES, rng).toLowerCase()}.${pick(LAST_NAMES, rng).toLowerCase()}@example.com`;
  } else if (/phone|\btel\b|\bfax\b|\bcell\b/.test(name)) {
    value = `${pick(["250", "604", "778", "236"], rng)}-555-${digits(4, rng)}`;
  } else if (/postal|zip/.test(name)) {
    value = postalCode(rng);
  } else if (/date|dob|birth/.test(name)) {
    value = dateValue(rng);
  } else if (/province/.test(name)) {
    value = "BC";
  } else if (/city|town|municipality/.test(name)) {
    value = pick(CITIES, rng);
  } else if (/address|street/.test(name)) {
    value = `${1 + Math.floor(rng() * 9000)} ${pick(STREETS, rng)}`;
  } else if (/name/.test(name)) {
    value = `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}`;
  } else if (/amount|total|fee|income|expense|\$|sum|cost|balance/.test(name)) {
    value = amount(rng);
  } else if (/file|number|\bno\b|registry/.test(name)) {
    value = `${pick(["S", "F", "C", "P"], rng)}-${10000 + Math.floor(rng() * 89999)}`;
  } else if (multiline) {
    value = sentence(8 + Math.floor(rng() * 8), rng);
  } else {
    value = sentence(2 + Math.floor(rng() * 3), rng);
  }
  return maxLength !== undefined ? value.slice(0, maxLength) : value;
}
