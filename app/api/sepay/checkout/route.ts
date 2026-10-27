import { eq } from "drizzle-orm";
import { SePayPgClient } from "sepay-pg-node";
import { ensureDb, getDb } from "../../../../db";
import { pledges } from "../../../../db/schema";

type SePayEnvironment = "sandbox" | "production";

function sepayConfig() {
  const merchantId = process.env.SEPAY_MERCHANT_ID;
  const secretKey = process.env.SEPAY_SECRET_KEY;
  const environment = (process.env.SEPAY_ENV ?? "sandbox") as SePayEnvironment;

  if (!merchantId || !secretKey) {
    throw new Error("SePay chưa được cấu hình trên server.");
  }
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("SEPAY_ENV không hợp lệ.");
  }

  return { merchantId, secretKey, environment };
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await request.json() as { pledgeId?: string };
    if (!body.pledgeId) {
      return Response.json({ error: "Thiếu mã pledge." }, { status: 400 });
    }

    const [pledge] = await getDb()
      .select({
        id: pledges.id,
        reference: pledges.reference,
        name: pledges.name,
        amount: pledges.amount,
        status: pledges.status,
      })
      .from(pledges)
      .where(eq(pledges.id, body.pledgeId))
      .limit(1);

    if (!pledge) {
      return Response.json({ error: "Không tìm thấy pledge." }, { status: 404 });
    }
    if (pledge.status === "confirmed") {
      return Response.json({ error: "Pledge này đã được thanh toán." }, { status: 409 });
    }

    const { merchantId, secretKey, environment } = sepayConfig();
    const client = new SePayPgClient({
      env: environment,
      merchant_id: merchantId,
      secret_key: secretKey,
    });
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
    const callback = (result: "success" | "error" | "cancel") => {
      const url = new URL(origin);
      url.searchParams.set("payment", result);
      url.searchParams.set("pledge", pledge.id);
      return url.toString();
    };

    const fields = client.checkout.initOneTimePaymentFields({
      payment_method: "BANK_TRANSFER",
      order_invoice_number: pledge.reference,
      order_amount: pledge.amount,
      currency: "VND",
      order_description: `San Cau pledge ${pledge.reference}`,
      success_url: callback("success"),
      error_url: callback("error"),
      cancel_url: callback("cancel"),
    });

    return Response.json({ checkoutUrl: client.checkout.initCheckoutUrl(), fields });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể tạo phiên thanh toán SePay." },
      { status: 500 },
    );
  }
}
