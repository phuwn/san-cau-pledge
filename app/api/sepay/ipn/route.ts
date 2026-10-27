import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { SePayPgClient } from "sepay-pg-node";
import { ensureDb, getDb } from "../../../../db";
import { pledges } from "../../../../db/schema";

type SePayIpn = {
  notification_type?: string;
  order?: {
    order_id?: string;
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

async function verifyPaidOrder(orderId: string, reference: string, expectedAmount: number) {
  const merchantId = process.env.SEPAY_LIVE_MERCHANT_ID ?? process.env.SEPAY_MERCHANT_ID;
  const secretKey = process.env.SEPAY_SECRET_KEY;
  const configuredEnvironment = process.env.SEPAY_ACTIVE_ENV ?? process.env.SEPAY_ENV;
  const environment = configuredEnvironment === "production" ? "production" : "sandbox";
  if (!merchantId || !secretKey) return false;

  const client = new SePayPgClient({ env: environment, merchant_id: merchantId, secret_key: secretKey });
  for (const identifier of [orderId, reference]) {
    try {
      const response = await client.order.retrieve(identifier);
      const candidates = [response.data?.data, response.data?.result?.data, response.data?.result, response.data];
      if (candidates.some(order =>
        order?.order_invoice_number === reference &&
        order?.order_status === "CAPTURED" &&
        order?.order_currency === "VND" &&
        Number(order?.order_amount) === expectedAmount,
      )) return true;
    } catch {
      // Sandbox API versions differ on whether this path accepts order ID or invoice number.
    }
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const secretKey = process.env.SEPAY_SECRET_KEY;
    if (!secretKey) {
      return Response.json({ error: "SePay chưa được cấu hình." }, { status: 503 });
    }
    const payload = await request.json() as SePayIpn;
    if (payload.notification_type !== "ORDER_PAID") {
      return Response.json({ success: true, ignored: true });
    }

    const reference = payload.order?.order_invoice_number;
    const orderAmount = Number(payload.order?.order_amount);
    const transactionAmount = Number(payload.transaction?.transaction_amount);
    if (!reference) {
      return Response.json({ success: true, matched: false });
    }

    await ensureDb();
    const [pledge] = await getDb()
      .select({ id: pledges.id, amount: pledges.amount })
      .from(pledges)
      .where(eq(pledges.reference, reference))
      .limit(1);

    // Dashboard tests use a synthetic invoice. Acknowledge it without touching
    // the database; only a known pledge can ever be marked as paid.
    if (!pledge) {
      return Response.json({ success: true, matched: false });
    }

    const validPayment =
      payload.order?.order_status === "CAPTURED" &&
      payload.order?.order_currency === "VND" &&
      payload.transaction?.transaction_status === "APPROVED" &&
      payload.transaction?.transaction_currency === "VND" &&
      Number.isFinite(orderAmount) &&
      orderAmount > 0 &&
      orderAmount === transactionAmount &&
      orderAmount === pledge.amount;

    if (!validPayment) {
      return Response.json({ error: "Thông tin thanh toán không hợp lệ." }, { status: 422 });
    }

    const authenticated = secretsMatch(request.headers.get("x-secret-key"), secretKey) ||
      Boolean(payload.order?.order_id && await verifyPaidOrder(payload.order.order_id, reference, pledge.amount));
    if (!authenticated) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [updated] = await getDb()
      .update(pledges)
      .set({ status: "confirmed", reportedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(pledges.reference, reference), eq(pledges.amount, orderAmount)))
      .returning({ id: pledges.id });

    return Response.json({ success: true, matched: Boolean(updated) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể xử lý IPN." },
      { status: 500 },
    );
  }
}
