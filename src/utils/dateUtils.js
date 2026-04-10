// src/utils/dateUtils.js
// Converts period strings to { start, end } Date ranges

/**
 * Returns start and end Date objects for a given named period.
 * @param {string} period
 * @returns {{ start: Date, end: Date }}
 */
export function getPeriodRange(period) {
  const now = new Date();

  const startOfDay = (d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t;
  };

  const endOfDay = (d) => {
    const t = new Date(d);
    t.setHours(23, 59, 59, 999);
    return t;
  };

  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };

    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }

    case "this_week": {
      const day = now.getDay(); // 0 = Sunday
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      return { start: startOfDay(monday), end: endOfDay(new Date()) };
    }

    case "last_week": {
      const curr = new Date();
      const day = curr.getDay();
      const lastMonday = new Date(curr);
      lastMonday.setDate(curr.getDate() - day - 6);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { start: startOfDay(lastMonday), end: endOfDay(lastSunday) };
    }

    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }

    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }

    case "all":
    default:
      return { start: new Date(0), end: new Date() };
  }
}

/**
 * Returns a human-friendly label for a period string.
 * @param {string} period
 */
export function periodLabel(period) {
  const map = {
    today: "Today",
    yesterday: "Yesterday",
    this_week: "This Week",
    last_week: "Last Week",
    this_month: "This Month",
    last_month: "Last Month",
    all: "All Time",
  };
  return map[period] ?? "This Month";
}

/**
 * Format a Date as a readable string.
 * @param {Date} date
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
