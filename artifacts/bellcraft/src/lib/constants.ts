export const ARABIC_DAYS = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت"
];

export const PRESET_COLORS = [
  "#14b8a6", // Teal
  "#f59e0b", // Amber
  "#0284c7", // Light Blue
  "#e11d48", // Rose
  "#8b5cf6", // Fuchsia
  "#10b981", // Emerald
  "#6366f1", // Violet
  "#f43f5e", // Red
  "#0ea5e9", // Sky
  "#84cc16", // Lime
];

export function formatTime(timeStr: string) {
  if (!timeStr) return "";
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "م" : "ص";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}
