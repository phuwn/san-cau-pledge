import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pledges = pgTable("pledges", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  plan: text("plan").notNull(),
  selectedDates: text("selected_dates").notNull(),
  seatCount: integer("seat_count").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
});
