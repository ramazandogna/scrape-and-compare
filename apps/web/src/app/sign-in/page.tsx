"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, loginRequest } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await loginRequest({ email, password });
      // Backend cookie'yi set etti, profile'i çekip context'i doldur.
      await refresh();
      toast.success("Hoş geldin 👋");
      const redirect = searchParams.get("redirect") ?? "/dashboard";
      router.replace(redirect);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Email veya şifre hatalı"
          : "Giriş yapılamadı, lütfen tekrar dene";
      setErrorMessage(message);
      // setUser çağrılmaz — auth state authenticated'a geçmez
      void setUser; // hook stabilitesi için ref tut, kullanılmayan param uyarısı vermesin
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      heading={
        <>
          Tekrar hoş geldin —{" "}
          <span className="text-brand-gradient">
            iş arayan
          </span>{" "}
          modunda mıyız?
        </>
      }
      description="Hesabına giriş yap, AI eşleşmelerin ve favori ilanların seni bekliyor."
      topRight={
        <span>
          Hesabın yok mu?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-brand hover:text-brand-soft"
          >
            Kaydol
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Şifre</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-brand hover:text-brand-soft"
            >
              Şifremi unuttum
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
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
              Giriş yapılıyor...
            </>
          ) : (
            "Giriş yap"
          )}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Devam ederek kullanım koşullarını kabul etmiş olursun.
        </p>
      </form>
    </AuthShell>
  );
}
