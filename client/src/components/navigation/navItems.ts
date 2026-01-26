import { useMemo } from "react";
import { GUEST_MODE } from "../../config/flags";

export type NavItem = {
  label: string;
  href?: string;
  disabled?: boolean;
};

export function useNavItems(): NavItem[] {
  return useMemo(() => {
    // Core navigation items available in all modes
    const coreItems: NavItem[] = [
      { label: "HOME", href: "/home" },
      { label: "PROFILE", href: "/closet" },
      { label: "S.K.A.T.E", href: "/game" },
      { label: "SPOTMAP", href: "/map" },
      { label: "HUBBA SHOP", href: "/shop" },
      { label: "THE TRENCHES", href: "/leaderboard" },
    ];

    if (GUEST_MODE) {
      // Guest mode: show core items but some may redirect to login
      return coreItems;
    }

    // Authenticated mode: add settings and other features
    return [
      ...coreItems,
      { label: "SETTINGS", href: "/settings" },
    ];
  }, []);
}
