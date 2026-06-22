import type { Period } from "@/types";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "30d", label: "30 Days" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
  { value: "12m", label: "12 Months" },
];
