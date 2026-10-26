import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { pledges } from "../../../db/schema";

const ALLOWED_DATES = new Set(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
const PLAN_RULES = { full: { amount: 325_000, seats: 5 }, flex: { amount: 135_000, seats: 2 }, dropin: { amount: 75_000, seats: 1 } } as const;
type Plan = keyof typeof PLAN_RULES;

function safeDates(value: string) {
  try { const dates = JSON.parse(value); return Array.isArray(dates) ? dates.filter((date): date is string => typeof date === "string") : []; }
  catch { return []; }
}
function publicName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length <= 1 ? (parts[0] ?? "Người chơi") : `${parts[0]} ${parts.at(-1)?.slice(0, 1)}.`;
}

export async function GET() {
  try {
    const rows = await getDb().select({ name: pledges.name, plan: pledges.plan, selectedDates: pledges.selectedDates, seatCount: pledges.seatCount, status: pledges.status }).from(pledges).orderBy(desc(pledges.createdAt)).limit(100);
    const dates = Object.fromEntries([...ALLOWED_DATES].map(date => [date, 0]));
    let totalCommitted = 0, reportedPayments = 0;
    for (const row of rows) {
      for (const date of safeDates(row.selectedDates)) if (date in dates) dates[date] += 1;
      totalCommitted += row.seatCount;
      if (row.status === "reported" || row.status === "confirmed") reportedPayments += 1;
    }
    return Response.json({ stats: { totalPledges: rows.length, reportedPayments, totalCommitted, dates, recent: rows.slice(0, 8).map(row => ({ name: publicName(row.name), plan: row.plan, seatCount: row.seatCount })) } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tải dữ liệu pledge." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; contact?: string; plan?: string; selectedDates?: string[] };
    const name = body.name?.trim() ?? "", contact = body.contact?.trim() ?? "", plan = body.plan as Plan;
    const selectedDates = Array.isArray(body.selectedDates) ? [...new Set(body.selectedDates.filter(date => ALLOWED_DATES.has(date)))] : [];
    const rule = PLAN_RULES[plan];
    if (name.length < 2 || name.length > 60) return Response.json({ error: "Tên cần từ 2–60 ký tự." }, { status: 400 });
    if (contact.length > 100) return Response.json({ error: "Thông tin liên hệ quá dài." }, { status: 400 });
    if (!rule || selectedDates.length !== rule.seats) return Response.json({ error: "Gói hoặc số ngày không hợp lệ." }, { status: 400 });
    const id = crypto.randomUUID(), reference = `SC${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const [created] = await getDb().insert(pledges).values({ id, reference, name, contact, plan, selectedDates: JSON.stringify(selectedDates), seatCount: rule.seats, amount: rule.amount }).returning();
    return Response.json({ pledge: { ...created, selectedDates } }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tạo pledge." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; action?: string };
    if (!body.id || body.action !== "report_payment") return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    const [updated] = await getDb().update(pledges).set({ status: "reported", reportedAt: sql`CURRENT_TIMESTAMP` }).where(eq(pledges.id, body.id)).returning({ id: pledges.id, status: pledges.status });
    return updated ? Response.json({ pledge: updated }) : Response.json({ error: "Không tìm thấy pledge." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể cập nhật pledge." }, { status: 500 }); }
}
