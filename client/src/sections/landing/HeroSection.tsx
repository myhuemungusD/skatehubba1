import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";

interface HeroSectionProps {
  badge?: {
    text: string;
    variant: "success" | "info";
  };
  title: string;
  subtitle?: string;
  description?: string;
  primaryCTA?: {
    text: string;
    href: string;
  };
  secondaryCTA?: {
    text: string;
    href: string;
  };
  trustIndicators?: Array<{
    icon: LucideIcon;
    text: string;
    color: string;
  }>;
}

export function HeroSection({
  badge,
  title,
  subtitle,
  description,
  primaryCTA,
  secondaryCTA,
  trustIndicators,
}: HeroSectionProps) {
  return (
    <section className="relative min-h-screen flex flex-col justify-center items-center text-center px-6">
      {/* Graffiti Background */}
      <div className="absolute inset-0 bg-[url('/graffiti-wall.jpg')] bg-cover bg-center opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black/90" />

      <div className="relative z-10 max-w-5xl mx-auto space-y-8 flex flex-col items-center">
        {/* Badge */}
        {badge && (
          <div
            className={`inline-flex items-center gap-2 ${
              badge.variant === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            } border rounded-full px-4 py-2 text-sm`}
          >
            <div
              className={`w-2 h-2 ${
                badge.variant === "success" ? "bg-green-500" : "bg-blue-500"
              } rounded-full animate-pulse`}
            />
            <span>{badge.text}</span>
          </div>
        )}

        {/* Title */}
        <h1
          className="text-6xl md:text-8xl font-extrabold tracking-tight text-orange-500 drop-shadow-[0_4px_8px_rgba(255,102,0,0.4)]"
          style={{ fontFamily: "'Permanent Marker', cursive" }}
        >
          {title}
        </h1>

        {/* Subtitle */}
        {subtitle && <p className="text-2xl md:text-3xl font-bold text-white">{subtitle}</p>}

        {/* Description */}
        {description && (
          <p className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">{description}</p>
        )}

        {/* CTAs */}
        {(primaryCTA || secondaryCTA) && (
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            {primaryCTA && (
              <Link href={primaryCTA.href}>
                <a className="bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold px-8 py-4 rounded-lg shadow-lg transition-all hover:scale-105 hover:shadow-orange-500/25 text-center">
                  {primaryCTA.text}
                </a>
              </Link>
            )}
            {secondaryCTA && (
              <Link href={secondaryCTA.href}>
                <a className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white text-lg font-semibold px-8 py-4 rounded-lg border border-white/20 transition-all hover:scale-105 text-center">
                  {secondaryCTA.text}
                </a>
              </Link>
            )}
          </div>
        )}

        {/* Trust Indicators */}
        {trustIndicators && trustIndicators.length > 0 && (
          <div className="flex flex-wrap justify-center gap-6 pt-8 text-sm text-gray-400">
            {trustIndicators.map((indicator, i) => (
              <div key={i} className="flex items-center gap-2">
                <indicator.icon className={`w-4 h-4 ${indicator.color}`} />
                <span>{indicator.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
