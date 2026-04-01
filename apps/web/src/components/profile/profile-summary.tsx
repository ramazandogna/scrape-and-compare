import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { UserDto } from "@/hooks/use-user";

interface ProfileSummaryProps {
  user: UserDto;
}

export function ProfileSummary({ user }: ProfileSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">📊 Profil Özeti</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <SummaryItem label="Kayıtlı Skill" value={user.techStack.length} />
          <SummaryItem label="Deneyim" value={`${user.experienceYears} yıl`} />
          <SummaryItem label="Tercih Edilen Rol" value={user.preferredRoles.length} />
          <SummaryItem
            label="Tercih Edilen Lokasyon"
            value={user.preferredLocations.length}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
