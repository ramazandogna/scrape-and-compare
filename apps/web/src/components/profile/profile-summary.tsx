import { Sparkles, Briefcase, MapPin, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { UserDto } from "@/hooks/use-user";

interface ProfileSummaryProps {
  user: UserDto;
}

// Compact 4-grid stat card without a header.
// Each stat: icon + number + label. Accent colors match the site CTA palette.

const STATS_DEF = [
  {
    key: "skills" as const,
    icon: Sparkles,
    label: "Yetenek",
    accent: "text-brand bg-brand-50 ring-brand-200/60",
  },
  {
    key: "experience" as const,
    icon: Activity,
    label: "Yıl deneyim",
    accent: "text-emerald-600 bg-emerald-50 ring-emerald-200/60",
  },
  {
    key: "roles" as const,
    icon: Briefcase,
    label: "Tercih edilen rol",
    accent: "text-fuchsia-600 bg-fuchsia-50 ring-fuchsia-200/60",
  },
  {
    key: "locations" as const,
    icon: MapPin,
    label: "Tercih edilen lokasyon",
    accent: "text-amber-600 bg-amber-50 ring-amber-200/60",
  },
];

export function ProfileSummary({ user }: ProfileSummaryProps) {
  const values: Record<(typeof STATS_DEF)[number]["key"], string | number> = {
    skills: user.techStack.length,
    experience: user.experienceYears,
    roles: user.preferredRoles.length,
    locations: user.preferredLocations.length,
  };

  return (
    <Card className="p-0">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {STATS_DEF.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.key}
              className={`flex items-center gap-3 p-4 ${
                idx % 2 === 0 ? "border-r" : ""
              } ${idx < 2 ? "border-b sm:border-b-0" : ""} ${
                idx === 1 ? "sm:border-r" : ""
              } ${idx === 2 ? "sm:border-r" : ""}`}
            >
              <span
                className={`flex size-9 items-center justify-center rounded-xl ring-1 ${stat.accent}`}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-none">
                  {values[stat.key]}
                </p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
