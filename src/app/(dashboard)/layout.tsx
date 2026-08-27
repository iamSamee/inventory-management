import NavBar from "@/components/NavBar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <NavBar />
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
