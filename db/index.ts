import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let database: NeonHttpDatabase<typeof schema> | undefined;
let initialization: Promise<void> | undefined;

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
  `.then(() => undefined);
  return initialization;
}
