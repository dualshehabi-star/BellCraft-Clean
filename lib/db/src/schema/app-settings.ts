import { pgTable, serial, text, real, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().default(""),
  // ── General ───────────────────────────────────────────────────────────
  bellSound: text("bell_sound").notNull().default("classic"),
  volume: real("volume").notNull().default(1.0),
  autoRing: boolean("auto_ring").notNull().default(true),
  vacationMode: boolean("vacation_mode").notNull().default(false),
  leadTimeMin: integer("lead_time_min").notNull().default(2),
  ringDurationSec: integer("ring_duration_sec").notNull().default(6),
  maxVolume: boolean("max_volume").notNull().default(false),
  // ── Pre-start alert (before period starts) ────────────────────────────
  preStartEnabled: boolean("pre_start_enabled").notNull().default(true),
  preStartRepeat: integer("pre_start_repeat").notNull().default(1),
  // ── Pre-end alert (before period ends) ────────────────────────────────
  preEndEnabled: boolean("pre_end_enabled").notNull().default(false),
  preEndMinBefore: integer("pre_end_min_before").notNull().default(5),
  preEndSound: text("pre_end_sound").notNull().default("classic"),
  preEndDurationSec: integer("pre_end_duration_sec").notNull().default(6),
  preEndRepeat: integer("pre_end_repeat").notNull().default(1),
  // ── End alert (when period ends) ──────────────────────────────────────
  endEnabled: boolean("end_enabled").notNull().default(false),
  endSound: text("end_sound").notNull().default("classic"),
  endDurationSec: integer("end_duration_sec").notNull().default(6),
  endRepeat: integer("end_repeat").notNull().default(1),
  // ── Web Push VAPID keys (generated on first use) ──────────────────────────
  vapidPublicKey: text("vapid_public_key"),
  vapidPrivateKey: text("vapid_private_key"),
});

export const insertAppSettingsSchema = createInsertSchema(appSettingsTable).omit({ id: true, deviceId: true });
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettingsTable.$inferSelect;
