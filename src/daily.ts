/** The shared daily puzzle changes at midnight UTC for every player. */
export const DAILY_TIME_ZONE = "UTC";

/** Build a daily seed from the date parts produced by Intl.DateTimeFormat. */
export function dailySeedFromParts(parts: readonly Intl.DateTimeFormatPart[]): string {
  const value = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find(part => part.type === type)?.value;
    if (!part) throw new Error(`Missing date part: ${type}`);
    return part;
  };
  return `daily-${value("year")}-${value("month")}-${value("day")}`;
}

/** Return the UTC daily seed, or throw a RangeError when `now` is an invalid Date. */
export function dailySeed(now = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("dailySeed requires a valid Date");
  }

  const parts = new Intl.DateTimeFormat("en", {
    timeZone: DAILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return dailySeedFromParts(parts);
}
