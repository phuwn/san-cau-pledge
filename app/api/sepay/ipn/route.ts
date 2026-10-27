import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ensureDb, getDb } from "../../../../db";
import { pledges } from "../../../../db/schema";

type SePayIpn = {
  notification_type?: string;
  order?: {
    order_status?: string;
    order_amount?: string;
    order_currency?: string;
    order_invoice_number?: string;
  };
  transaction?: {
    transaction_status?: string;
    transaction_amount?: string;
    transaction_currency?: string;
  };
};

function secretsMatch(received: string | null, expected: string) {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    const secretKey = process.env.SEPAY_SECRET_KEY;
    if (!secretKey) {
      return Response.json({ error: "SePay chưa được cấu hình." }, { status: 503 });
    }
    if (!secretsMatch(request.headers.get("x-secret-key"), secretKey)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json() as SePayIpn;
    if (payload.notification_type !== "ORDER_PAID") {
      return Response.json({ success: true, ignored: true });
    }

    const reference = payload.order?.order_invoice_number;
    const orderAmount = Number(payload.order?.order_amount);
    const transactionAmount = Number(payload.transaction?.transaction_amount);
    const validPayment =
      reference &&
      payload.order?.order_status === "CAPTURED" &&
      payload.order?.order_currency === "VND" &&
      payload.transaction?.transaction_status === "APPROVED" &&
      payload.transaction?.transaction_currency === "VND" &&
      Number.isFinite(orderAmount) &&
      orderAmount > 0 &&
      orderAmount === transactionAmount;

    if (!validPayment) {
      return Response.json({ error: "Thông tin thanh toán không hợp lệ." }, { status: 422 });
    }

    await ensureDb();
    const [updated] = await getDb()
      .update(pledges)
      .set({ status: "confirmed", reportedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(pledges.reference, reference), eq(pledges.amount, orderAmount)))
      .returning({ id: pledges.id });

    // SePay's dashboard test can use a synthetic invoice. Acknowledge it without
    // changing any pledge; real payments are matched by both invoice and amount.
    return Response.json({ success: true, matched: Boolean(updated) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể xử lý IPN." },
      { status: 500 },
    );
  }
}
