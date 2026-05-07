"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupRequest, useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";

export default function SignUpPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await signupRequest({ email, name, password });
      await refresh();
      toast.success("Hesabın hazır — başlayalım!");
      router.replace("/profile");
    } catch (err) {
      let message = "Hesap oluşturulamadı, lütfen tekrar dene";
      if (err instanceof ApiError) {
        if (err.status === 409) message = "Bu email adresi zaten kayıtlı";
        else if (err.status === 400) message = "Form bilgileri geçersiz";
      }
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      heading={
        <>
          Sıfırdan akıllı bir{" "}
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            iş arama
          </span>{" "}
          akışı.
        </>
      }
      description="Hesabını oluştur — profilini doldur, ilanları biz bulalım, AI senin için puanlasın."
      topRight={
        <span>
          Zaten hesabın var mı?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-violet-600 hover:text-violet-700"
          >
            Giriş yap
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">İsim</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adın"
            required
            autoComplete="name"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="senin@email.com"
            required
            autoComplete="email"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Şifre</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 8 karakter"
              required
              minLength={8}
              autoComplete="new-password"
              className="h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Şifreni güçlü tut — 8+ karakter, mümkünse rakam ve sembol içersin.
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}

        <Button
          type="submit"
          variant="hero"
          disabled={isLoading}
          className="h-11 w-full text-sm font-semibold"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Hesap oluşturuluyor...
            </>
          ) : (
            "Hesap oluştur"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
