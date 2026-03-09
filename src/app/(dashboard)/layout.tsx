import { Sidebar, MobileSidebar } from "@/components/layout/Sidebar";
import { AlertBell } from "@/components/layout/AlertBell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar — always visible */}
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center">
            <MobileSidebar />
            <span className="ml-3 font-semibold text-sm md:hidden">
              Finance Command Center
            </span>
          </div>
          <AlertBell />
        </header>
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
