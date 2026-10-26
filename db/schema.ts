import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pledges = sqliteTable("pledges", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  plan: text("plan").notNull(),
  selectedDates: text("selected_dates").notNull(),
  seatCount: integer("seat_count").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reportedAt: text("reported_at"),
});
