/** The shared daily puzzle changes at midnight UTC for every player. */
export const DAILY_TIME_ZONE = "UTC";

export function dailySeed(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: DAILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `daily-${value("year")}-${value("month")}-${value("day")}`;
}
