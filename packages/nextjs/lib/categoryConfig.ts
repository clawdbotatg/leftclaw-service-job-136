export const CATEGORIES = [
  { id: 0, name: "Pass", icon: "🎫", color: "#F59E0B", useCase: "Tickets, boarding passes, QR codes" },
  { id: 1, name: "Receipt", icon: "🧾", color: "#64748B", useCase: "Purchases, invoices, warranties" },
  { id: 2, name: "Memory", icon: "📸", color: "#F43F5E", useCase: "Photos, moments, keepsakes" },
  { id: 3, name: "Membership", icon: "🏷️", color: "#6366F1", useCase: "Club cards, subscriptions, loyalty" },
  { id: 4, name: "Medical", icon: "🏥", color: "#10B981", useCase: "Records, prescriptions, test results" },
  { id: 5, name: "Warranty", icon: "🔧", color: "#B45309", useCase: "Appliance cards, product warranties" },
  { id: 6, name: "Identity", icon: "🪪", color: "#0EA5E9", useCase: "IDs, licenses, credentials" },
  { id: 7, name: "Crypto", icon: "🔑", color: "#8B5CF6", useCase: "Seed phrase hints, wallet notes" },
  { id: 8, name: "Other", icon: "📦", color: "#6B7280", useCase: "Everything else" },
] as const;

export type CategoryId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const getCategory = (id: number) => {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[8];
};
