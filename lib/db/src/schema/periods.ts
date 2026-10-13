import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { schedulesTable } from "./schedules";
import { subjectsTable } from "./subjects";

export const periodsTable = pgTable("periods", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").notNull().references(() => schedulesTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").references(() => subjectsTable.id, { onDelete: "set null" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  label: text("label"),
  alertMinutesBefore: integer("alert_minutes_before").notNull().default(5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPeriodSchema = createInsertSchema(periodsTable).omit({ id: true, createdAt: true });
export type InsertPeriod = z.infer<typeof insertPeriodSchema>;
export type Period = typeof periodsTable.$inferSelect;
