/**
 * Home Page (Member Hub)
 *
 * Purpose: Authenticated user dashboard with quick actions
 * Target: Authenticated users only
 * Goal: Provide quick access to core platform features
 *
 * Content: Action-oriented dashboard
 * - Welcome message with status badge
 * - Quick action buttons for Feed/Map/Battle/Profile
 * - Feature overview for new members
 *
 * Behavior:
 * - Protected route (requires authentication)
 * - Shows member hub interface with quick actions
 * - Matches routing policy: "/home → Member hub (authenticated users only, action dashboard)"
 */

import { MemberHubHero } from "../sections/home/MemberHubHero";
import { FeatureGrid } from "../sections/landing/FeatureGrid";
import { homeContent } from "../content/home";

export default function Home() {
  return (
    <div className="min-h-screen">
      <MemberHubHero
        badge={homeContent.hero.badge}
        title={homeContent.hero.title}
        quickActions={homeContent.hero.quickActions}
      />
      
      <FeatureGrid features={homeContent.features} columns={4} />
    </div>
  );
}
