const DISPLAY_LOCALE = "en-GB";

const parseDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDisplayDate = (value: string | Date) => {
  const date = parseDate(value);
  if (!date) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return date.toLocaleDateString(DISPLAY_LOCALE);
};

export const formatDisplayDateTime = (value: string | Date) => {
  const date = parseDate(value);
  if (!date) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return date.toLocaleString(DISPLAY_LOCALE, {
    hour12: false,
  });
};

export const formatShortDisplayDate = (value: string | Date) => {
  const date = parseDate(value);
  if (!date) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};
