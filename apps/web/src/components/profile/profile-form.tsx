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
import type { UserDto, CreateUserInput } from "@/hooks/use-user";

interface ProfileFormProps {
  user: UserDto | null;
  onSave: (input: CreateUserInput) => Promise<UserDto | null>;
  onUpdate: (input: Partial<CreateUserInput>) => Promise<UserDto | null>;
  error: string | null;
}

/**
 * Profil oluşturma / düzenleme formu.
 * Parent key={user?.id ?? "new"} ile render eder — user değişince
 * React component'ı unmount/remount ederek state'i sıfırlar.
 * Bu sayede useEffect içinde setState yapmaya gerek kalmaz.
 */
export function ProfileForm({ user, onSave, onUpdate, error }: ProfileFormProps) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [techStack, setTechStack] = useState<string[]>(user?.techStack ?? []);
  const [experienceYears, setExperienceYears] = useState(user?.experienceYears ?? 0);
  const [preferredRoles, setPreferredRoles] = useState<string[]>(user?.preferredRoles ?? []);
  const [preferredLocations, setPreferredLocations] = useState<string[]>(user?.preferredLocations ?? []);
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = user !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    const input: CreateUserInput = {
      email,
      name,
      techStack,
      experienceYears,
      preferredRoles,
      preferredLocations,
    };

    const result = isEditMode ? await onUpdate(input) : await onSave(input);

    setIsSaving(false);

    if (result) {
      toast.success(
        isEditMode ? "Profil güncellendi!" : "Profil oluşturuldu!"
      );
    }
  }

  /** Error prop değiştiğinde toast göster */
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {isEditMode ? "Profili Düzenle" : "Profil Oluştur"}
        </CardTitle>
        <CardDescription>
          {isEditMode
            ? "Bilgilerinizi güncelleyin, daha doğru eşleşmeler alın."
            : "Yeteneklerinizi girin, AI size en uygun ilanları bulsun."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email + Name — yan yana */}
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

          {/* Experience + Preferred Roles — yan yana */}
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
          <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
            {isSaving
              ? "Kaydediliyor..."
              : isEditMode
                ? "💾 Güncelle"
                : "💾 Kaydet"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
