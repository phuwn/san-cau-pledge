export type Plan = "full" | "flex" | "dropin";

export const SESSION_DATES = [
  { value: "2026-11-01", day: "01" },
  { value: "2026-11-08", day: "08" },
  { value: "2026-11-15", day: "15" },
  { value: "2026-11-22", day: "22" },
  { value: "2026-11-29", day: "29" },
] as const;

export const MIN_SLOTS_PER_COURT = 6;
export const MAX_PLAYERS_PER_COURT = 8;

const DROP_IN_PRICE = 75_000;
const FLEX_PRICE_PER_SESSION = 67_500;
const FULL_PRICE_PER_SESSION = 65_000;

export function quoteSelection(sessionCount: number) {
  if (sessionCount < 1 || sessionCount > SESSION_DATES.length) return null;
  if (sessionCount === SESSION_DATES.length) {
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

export function courtPlan(slotCount: number) {
  const courts = Math.floor(slotCount / MIN_SLOTS_PER_COURT);
  const capacity = courts * MAX_PLAYERS_PER_COURT;
  const overflow = Math.max(0, slotCount - capacity);
  const slotsToNextCourt = MIN_SLOTS_PER_COURT - (slotCount % MIN_SLOTS_PER_COURT);
  return { courts, capacity, overflow, slotsToNextCourt };
}
