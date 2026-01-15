import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, MapPin, Scan, ShoppingBag, User } from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Hub", href: "/feed", icon: Home },
  { label: "Spots", href: "/map", icon: MapPin },
  { label: "AR", href: "/trickmint", icon: Scan },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Me", href: "/checkins", icon: User },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col md:flex-row">
      {/* Side nav - desktop only (hidden on mobile) */}
      <nav
        className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 border-r border-neutral-800 bg-neutral-950/95 flex-col items-center py-6 gap-2 z-50"
        role="navigation"
        aria-label="Dashboard navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg px-3 py-3 text-xs font-medium transition-colors w-16 ${
                isActive
                  ? "text-yellow-400 bg-neutral-800"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main content - responsive width, offset for side nav on desktop */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-4 md:ml-20 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="mx-auto w-full max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl px-4 pt-4">
          {children}
        </div>
      </main>

      {/* Bottom nav - mobile only (hidden on desktop) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] z-50"
        role="navigation"
        aria-label="Dashboard navigation"
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-yellow-400"
                    : "text-neutral-400 hover:text-white"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
