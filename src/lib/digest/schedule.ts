type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function zonedParts(date: Date, timeZone: string): ZonedDateParts {
  const formatted = zonedFormatter(timeZone).formatToParts(date);
  const lookup = new Map(formatted.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get("year") ?? 0),
    month: Number(lookup.get("month") ?? 1),
    day: Number(lookup.get("day") ?? 1),
    hour: Number(lookup.get("hour") ?? 0),
    minute: Number(lookup.get("minute") ?? 0),
    second: Number(lookup.get("second") ?? 0),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function utcFromZonedParts(parts: ZonedDateParts, timeZone: string) {
  const guess = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );
  const offsetMs = timeZoneOffsetMs(guess, timeZone);

  return new Date(guess.getTime() - offsetMs);
}

function addLocalDays(parts: ZonedDateParts, days: number): ZonedDateParts {
  const next = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0),
  );

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function normalizeTimeZone(timeZone: string | null | undefined) {
  const candidate = timeZone?.trim() || "UTC";

  try {
    zonedFormatter(candidate).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

export function nextDigestRunAt(input: {
  timeZone: string | null | undefined;
  digestHour: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const timeZone = normalizeTimeZone(input.timeZone);
  const localNow = zonedParts(now, timeZone);
  let target: ZonedDateParts = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
    hour: input.digestHour,
    minute: 0,
    second: 0,
  };
  let scheduled = utcFromZonedParts(target, timeZone);

  if (scheduled.getTime() <= now.getTime() + 60_000) {
    target = addLocalDays(target, 1);
    scheduled = utcFromZonedParts(target, timeZone);
  }

  return scheduled;
}
