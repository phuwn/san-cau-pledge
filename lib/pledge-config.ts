export type Plan = "full" | "flex" | "dropin";

export const SESSION_DATES = [
  { value: "2026-11-01", day: "01" },
  { value: "2026-11-08", day: "08" },
  { value: "2026-11-15", day: "15" },
  { value: "2026-11-22", day: "22" },
  { value: "2026-11-29", day: "29" },
] as const;

export const PLEDGE_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const FULL_PLEDGE_DEADLINE = "2026-11-05";
export const FULL_PLEDGE_DEADLINE_LABEL = "00:00 05/11";
export const FIRST_SUNDAY_DATE = SESSION_DATES.find(date => Number(date.day) <= 6)?.value ?? SESSION_DATES[0].value;

const DROP_IN_PRICE = 75_000;
const FLEX_PRICE_PER_SESSION = 67_500;
const FULL_PRICE_PER_SESSION = 65_000;

function dateKeyInTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLEDGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isFullPledgeDeadlinePassed(now = new Date()) {
  return dateKeyInTimeZone(now) >= FULL_PLEDGE_DEADLINE;
}

export function quoteSelection(sessionCount: number, fullPlanAvailable = true) {
  if (sessionCount < 1 || sessionCount > SESSION_DATES.length) return null;
  if (sessionCount === SESSION_DATES.length && fullPlanAvailable) {
    return {
      plan: "full" as const,
      name: "Trụ tháng",
      amount: sessionCount * FULL_PRICE_PER_SESSION,
      pricePerSession: FULL_PRICE_PER_SESSION,
      badge: "Tự động lên Trụ tháng",
    };
  }
  if (sessionCount === 1) {
    return {
      plan: "dropin" as const,
      name: "Vãng lai",
      amount: DROP_IN_PRICE,
      pricePerSession: DROP_IN_PRICE,
      badge: "1 buổi",
    };
  }
  return {
    plan: "flex" as const,
    name: "Lịch linh hoạt",
    amount: sessionCount * FLEX_PRICE_PER_SESSION,
    pricePerSession: FLEX_PRICE_PER_SESSION,
    badge: `${sessionCount} buổi`,
  };
}

export function planName(plan: Plan) {
  if (plan === "full") return "Trụ tháng";
  if (plan === "flex") return "Lịch linh hoạt";
  return "Vãng lai";
}
