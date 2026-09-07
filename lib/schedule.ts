export type RefreshMode = "MORNING" | "AFTERNOON";

export function onDemandRefreshMode(now = new Date()): RefreshMode {
  const minutes = minutesInRome(now);
  return minutes >= 14 * 60 + 30 && minutes <= 23 * 60 + 30 ? "AFTERNOON" : "MORNING";
}

export function scheduledRomeMode(now = new Date(), toleranceMinutes = 35): RefreshMode | null {
  const minutes = minutesInRome(now);
  if (Math.abs(minutes - (9 * 60 + 15)) <= toleranceMinutes) return "MORNING";
  if (Math.abs(minutes - (18 * 60 + 15)) <= toleranceMinutes) return "AFTERNOON";
  return null;
}

export function dateInRome(now = new Date()) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function olderThan90Minutes(value: string | null, now = Date.now()) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || now - timestamp > 90 * 60_000;
}

function minutesInRome(now: Date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
}
