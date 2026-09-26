import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

/** "قبل ساعتين" — يُستخدم في كل مكان لتوحيد صياغة الوقت. */
export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
  } catch {
    return "—";
  }
}

export function arabicNumber(value: number): string {
  return value.toLocaleString("ar-EG");
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "صباح الخير";
  if (hour < 17) return "طاب يومك";
  return "مساء الخير";
}

export function longDate(date = new Date()): string {
  return date.toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
