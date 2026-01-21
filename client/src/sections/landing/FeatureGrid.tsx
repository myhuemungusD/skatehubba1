import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: string | LucideIcon;
  title: string;
  description: string;
  iconColor?: string;
}

interface FeatureGridProps {
  features: Feature[];
  columns?: 2 | 3 | 4;
}

export function FeatureGrid({ features, columns = 3 }: FeatureGridProps) {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
  };

  return (
    <section className="py-24 px-6">
      <div className={`max-w-6xl mx-auto grid gap-8 ${gridCols[columns]}`}>
        {features.map((feature, i) => {
          const IconComponent = typeof feature.icon === "function" ? feature.icon : null;

          return (
            <div
              key={i}
              className="bg-black/60 backdrop-blur-md border border-zinc-800 rounded-xl p-6 hover:border-orange-500/50 transition-all"
            >
              <div className="text-4xl mb-4">
                {typeof feature.icon === "string" ? (
                  feature.icon
                ) : IconComponent ? (
                  <IconComponent
                    className={`w-10 h-10 ${feature.iconColor || "text-orange-500"}`}
                  />
                ) : null}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
