import { Shield, CheckCircle, Zap } from "lucide-react";

export const landingContent = {
  hero: {
    badge: {
      text: "Platform Active • Beta Access Available",
      variant: "success" as const,
    },
    title: "SkateHubba",
    subtitle: "Own Your Tricks. Play SKATE Anywhere.",
    description:
      "Remote S.K.A.T.E. battles, spot check-ins, and leaderboards. Built for real skaters.",
    primaryCTA: {
      text: "Enter Platform",
      href: "/signin",
    },
    secondaryCTA: {
      text: "View Platform Specs",
      href: "/specs",
    },
  },
  trustIndicators: [
    {
      icon: Shield,
      text: "Secure Authentication",
      color: "text-green-500",
    },
    {
      icon: Zap,
      text: "Real-time Multiplayer",
      color: "text-yellow-500",
    },
    {
      icon: CheckCircle,
      text: "Free to Join",
      color: "text-blue-500",
    },
  ],
  features: [
    {
      icon: "🎮",
      title: "Remote S.K.A.T.E. Battles",
      description:
        "Challenge skaters worldwide. Submit trick videos, vote, and compete for rankings.",
    },
    {
      icon: "📍",
      title: "Spot Check-ins",
      description:
        "Document your sessions at legendary spots. Build your trick history and credibility.",
    },
    {
      icon: "🏆",
      title: "Leaderboards",
      description: "Track your progression. See how you rank against the community.",
    },
  ],
};
