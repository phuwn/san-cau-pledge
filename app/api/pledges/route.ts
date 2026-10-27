import { desc, eq, sql } from "drizzle-orm";
import { ensureDb, getDb } from "../../../db";
import { pledges } from "../../../db/schema";
import { quoteSelection, SESSION_DATES } from "../../../lib/pledge-config";

const ALLOWED_DATES = new Set<string>(SESSION_DATES.map(date => date.value));

function safeDates(value: string) {
  try { const dates = JSON.parse(value); return Array.isArray(dates) ? dates.filter((date): date is string => typeof date === "string") : []; }
  catch { return []; }
}
function publicName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length <= 1 ? (parts[0] ?? "Người chơi") : `${parts[0]} ${parts.at(-1)?.slice(0, 1)}.`;
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const pledgeId = new URL(request.url).searchParams.get("id");
    if (pledgeId) {
      const [pledge] = await getDb()
        .select({ id: pledges.id, reference: pledges.reference, plan: pledges.plan, selectedDates: pledges.selectedDates, amount: pledges.amount, status: pledges.status })
        .from(pledges)
        .where(eq(pledges.id, pledgeId))
        .limit(1);
      return pledge
        ? Response.json({ pledge: { ...pledge, selectedDates: safeDates(pledge.selectedDates) } })
        : Response.json({ error: "Không tìm thấy pledge." }, { status: 404 });
    }
    const rows = await getDb().select({ name: pledges.name, plan: pledges.plan, selectedDates: pledges.selectedDates, seatCount: pledges.seatCount, status: pledges.status }).from(pledges).orderBy(desc(pledges.createdAt)).limit(100);
    const dates = Object.fromEntries([...ALLOWED_DATES].map(date => [date, 0]));
    const participants = Object.fromEntries([...ALLOWED_DATES].map(date => [date, [] as Array<{ name: string; plan: string }>]));
    let totalCommitted = 0, reportedPayments = 0;
    for (const row of rows) {
      const booked = row.status === "reported" || row.status === "confirmed";
      if (booked) {
        for (const date of safeDates(row.selectedDates)) if (date in dates) {
          dates[date] += 1;
          participants[date].push({ name: publicName(row.name), plan: row.plan });
        }
        totalCommitted += row.seatCount;
        reportedPayments += 1;
      }
    }
    return Response.json({ stats: { totalPledges: rows.length, reportedPayments, totalCommitted, dates, participants, recent: rows.filter(row => row.status === "reported" || row.status === "confirmed").slice(0, 8).map(row => ({ name: publicName(row.name), plan: row.plan, seatCount: row.seatCount })) } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tải dữ liệu pledge." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await request.json() as { name?: string; contact?: string; selectedDates?: string[] };
    const name = body.name?.trim() ?? "", contact = body.contact?.trim() ?? "";
    const selectedDates = Array.isArray(body.selectedDates) ? [...new Set(body.selectedDates.filter(date => ALLOWED_DATES.has(date)))] : [];
    const quote = quoteSelection(selectedDates.length);
    if (name.length < 2 || name.length > 60) return Response.json({ error: "Tên cần từ 2–60 ký tự." }, { status: 400 });
    if (contact.length > 100) return Response.json({ error: "Thông tin liên hệ quá dài." }, { status: 400 });
    if (!quote) return Response.json({ error: "Hãy chọn ít nhất một Chủ nhật hợp lệ." }, { status: 400 });
    const id = crypto.randomUUID(), reference = `SC${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const [created] = await getDb().insert(pledges).values({ id, reference, name, contact, plan: quote.plan, selectedDates: JSON.stringify(selectedDates), seatCount: selectedDates.length, amount: quote.amount }).returning();
    return Response.json({ pledge: { ...created, selectedDates } }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tạo pledge." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = await request.json() as { id?: string; action?: string };
    if (!body.id || body.action !== "report_payment") return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    const [updated] = await getDb().update(pledges).set({ status: "reported", reportedAt: sql`CURRENT_TIMESTAMP` }).where(eq(pledges.id, body.id)).returning({ id: pledges.id, status: pledges.status });
    return updated ? Response.json({ pledge: updated }) : Response.json({ error: "Không tìm thấy pledge." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể cập nhật pledge." }, { status: 500 }); }
}
