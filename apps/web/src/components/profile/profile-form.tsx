"use client";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TagInput } from "@/components/profile/tag-input";
import type { UserDto, UpdateUserInput } from "@/hooks/use-user";

interface ProfileFormProps {
  user: UserDto;
  onUpdate: (input: UpdateUserInput) => Promise<UserDto | null>;
  error: string | null;
}

/**
 * Profile edit form — the create flow moved to /sign-up alongside auth.
 * This form only updates the existing user's info.
 */
export function ProfileForm({ user, onUpdate, error }: ProfileFormProps) {
  const [email, setEmail] = useState(user.email);
  const [name, setName] = useState(user.name);
  const [techStack, setTechStack] = useState<string[]>(user.techStack);
  const [experienceYears, setExperienceYears] = useState(user.experienceYears);
  const [preferredRoles, setPreferredRoles] = useState<string[]>(user.preferredRoles);
  const [preferredLocations, setPreferredLocations] = useState<string[]>(user.preferredLocations);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    const result = await onUpdate({
      email,
      name,
      techStack,
      experienceYears,
      preferredRoles,
      preferredLocations,
    });

    setIsSaving(false);

    if (result) {
      toast.success("Profil güncellendi");
    }
  }

  /** Show toast whenever the error prop changes */
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-brand-gradient-soft px-6 py-5">
        <CardHeader className="p-0">
          <CardTitle className="text-base font-semibold">
            Profili Düzenle
          </CardTitle>
          <CardDescription className="text-xs">
            Bilgilerini güncelle, daha doğru eşleşmeler al.
          </CardDescription>
        </CardHeader>
      </div>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email + Name — side by side */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">İsim</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Adınız"
                required
              />
            </div>
          </div>

          {/* Tech Stack */}
          <div className="space-y-2">
            <Label>Yetenekler (Tech Stack)</Label>
            <TagInput
              value={techStack}
              onChange={setTechStack}
              placeholder="React, TypeScript, Node.js..."
              maxTags={50}
            />
            <p className="text-xs text-muted-foreground">
              Virgül veya Enter ile etiketleyin. Otomatik normalizasyon uygulanır. {techStack.length}/50
            </p>
          </div>

          {/* Experience + Preferred Roles — side by side */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="experience">Deneyim (Yıl)</Label>
              <Input
                id="experience"
                type="number"
                min={0}
                max={50}
                value={experienceYears}
                onChange={(e) =>
                  setExperienceYears(Number(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Tercih Edilen Roller</Label>
              <TagInput
                value={preferredRoles}
                onChange={setPreferredRoles}
                placeholder="Frontend Developer..."
                maxTags={10}
              />
            </div>
          </div>

          {/* Preferred Locations */}
          <div className="space-y-2">
            <Label>Tercih Edilen Lokasyonlar</Label>
            <TagInput
              value={preferredLocations}
              onChange={setPreferredLocations}
              placeholder="Istanbul, Remote..."
              maxTags={10}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="default"
              disabled={isSaving}
              className="h-10 px-5 text-sm font-semibold"
            >
              {isSaving ? "Kaydediliyor..." : "Güncelle"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
