import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let database: NeonHttpDatabase<typeof schema> | undefined;
let initialization: Promise<void> | undefined;

const NOVEMBER_DATES = ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"];

const requestedPledges = [
  { id: "seed-2026-11-khang", reference: "SC26KHG1", name: "Khang", plan: "full", dates: NOVEMBER_DATES, amount: 325_000 },
  { id: "seed-2026-11-huy", reference: "SC26HUY1", name: "Huy", plan: "full", dates: NOVEMBER_DATES, amount: 325_000 },
  { id: "seed-2026-11-an", reference: "SC26ANN1", name: "An", plan: "flex", dates: NOVEMBER_DATES.slice(1), amount: 270_000 },
] as const;

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL chưa được cấu hình. Hãy kết nối Neon với project Vercel.");
  }
  return value;
}

export function getDb() {
  database ??= drizzle(neon(databaseUrl()), { schema });
  return database;
}

async function seedRequestedPledges() {
  const sql = neon(databaseUrl());
  for (const pledge of requestedPledges) {
    const selectedDates = JSON.stringify(pledge.dates);
    await sql`
      UPDATE pledges
      SET name = ${pledge.name},
          plan = ${pledge.plan},
          selected_dates = ${selectedDates},
          seat_count = ${pledge.dates.length},
          amount = ${pledge.amount},
          status = 'confirmed'
      WHERE lower(btrim(name)) = lower(${pledge.name})
    `;
    await sql`
      INSERT INTO pledges (id, reference, name, contact, plan, selected_dates, seat_count, amount, status)
      SELECT ${pledge.id}, ${pledge.reference}, ${pledge.name}, '', ${pledge.plan}, ${selectedDates}, ${pledge.dates.length}, ${pledge.amount}, 'confirmed'
      WHERE NOT EXISTS (
        SELECT 1 FROM pledges WHERE lower(btrim(name)) = lower(${pledge.name})
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        plan = EXCLUDED.plan,
        selected_dates = EXCLUDED.selected_dates,
        seat_count = EXCLUDED.seat_count,
        amount = EXCLUDED.amount,
        status = EXCLUDED.status
    `;
  }
}

export function ensureDb() {
  initialization ??= neon(databaseUrl())`
    CREATE TABLE IF NOT EXISTS pledges (
      id text PRIMARY KEY,
      reference text NOT NULL UNIQUE,
      name text NOT NULL,
      contact text NOT NULL DEFAULT '',
      plan text NOT NULL,
      selected_dates text NOT NULL,
      seat_count integer NOT NULL,
      amount integer NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      reported_at timestamptz
    )
  `.then(seedRequestedPledges);
  return initialization;
}
