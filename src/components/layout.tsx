import { Link, useLocation } from "wouter";
import { LayoutDashboard, CalendarDays, Settings, Bell } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/schedules", label: "الجداول", icon: CalendarDays },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location === href || location.startsWith(href + "/");

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 50%, rgba(219,234,254,0.4) 100%)" }}
      dir="rtl"
    >
      {/* Top App Bar — sits above notch / status bar */}
      <header
        className="fixed top-0 inset-x-0 z-40 max-w-md sm:max-w-2xl mx-auto"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div
          className="mx-3 mt-3 rounded-2xl px-5 py-3 flex items-center justify-between"
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)",
            boxShadow: "0 4px 20px rgba(30,58,138,0.35)",
          }}
          dir="ltr"
        >
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-white" strokeWidth={2.5} />
            <span
              className="text-white font-extrabold"
              style={{ fontSize: 19, fontFamily: "system-ui, sans-serif", letterSpacing: "0.03em" }}
            >
              BellCraft
            </span>
          </div>
        </div>
      </header>

      {/* Content — offset clears the top bar + notch and the bottom nav + home indicator */}
      <div
        className="min-h-screen w-full max-w-md sm:max-w-2xl mx-auto px-4"
        style={{
          paddingTop: "calc(6rem + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {children}
      </div>

      {/* Floating bottom nav — clears home indicator / gesture bar */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 max-w-md sm:max-w-2xl mx-auto px-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          className="rounded-2xl border border-slate-200 grid grid-cols-3"
          style={{ background: "white", boxShadow: "0 10px 30px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.04)" }}
        >
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className="flex flex-col items-center gap-1 py-3 tap cursor-pointer">
                  <div className="relative">
                    {active && (
                      <motion.div
                        layoutId="nav-active"
                        className="absolute inset-0 -m-2.5 rounded-xl bg-blue-50"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <item.icon
                      className={`relative w-6 h-6 transition-colors ${active ? "text-blue-700" : "text-slate-400"}`}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </div>
                  <span className={`relative text-[11px] font-bold transition-colors ${active ? "text-blue-800" : "text-slate-400"}`}>
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
