import AdminGate from "./AdminGate";

export const metadata = { title: "DEBUG · Әкімші панелі" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
