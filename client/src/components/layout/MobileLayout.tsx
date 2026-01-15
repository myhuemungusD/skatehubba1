import type { ReactNode } from "react";

interface MobileLayoutProps {
  children: ReactNode;
  className?: string;
  /** Force mobile width on all screen sizes (default: false - responsive) */
  forceMobile?: boolean;
}

export default function MobileLayout({ children, className, forceMobile = false }: MobileLayoutProps) {
  const maxWidthClass = forceMobile 
    ? "max-w-md" 
    : "max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl";
  
  return (
    <div className={`min-h-screen bg-neutral-950 ${className ?? ""}`.trim()}>
      <main className={`mx-auto w-full ${maxWidthClass} px-4`}>{children}</main>
    </div>
  );
}
