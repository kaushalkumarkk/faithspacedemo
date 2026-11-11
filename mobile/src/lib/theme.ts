export const Theme = {
  bg: "#090A10",
  surface: "#12141F",
  surfaceElevated: "#1A1D2D",
  border: "#25293E",
  borderStrong: "#343A57",
  brand: "#6E56FF",
  brandSoft: "rgba(110, 86, 255, 0.16)",
  accent: "#22D3EE",
  accentSoft: "rgba(34, 211, 238, 0.15)",
  text: "#F7F8FC",
  textSecondary: "#C5C8DA",
  textMuted: "#8B90A8",
  danger: "#FF5C77",
  dangerSoft: "rgba(255, 92, 119, 0.14)",
  success: "#2BD98C",
  successSoft: "rgba(43, 217, 140, 0.14)",
  warn: "#F5A623",
  warnSoft: "rgba(245, 166, 35, 0.15)",
} as const;

export function statusColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case "approved":
    case "resolved":
      return { bg: Theme.successSoft, fg: Theme.success };
    case "pending":
    case "open":
      return { bg: Theme.warnSoft, fg: Theme.warn };
    case "rejected":
      return { bg: Theme.dangerSoft, fg: Theme.danger };
    default:
      return { bg: Theme.surfaceElevated, fg: Theme.textMuted };
  }
}
