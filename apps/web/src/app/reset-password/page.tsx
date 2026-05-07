"use client";

import { useState, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordRequest, useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();

  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await resetPasswordRequest({ token, password });
      await refresh();
      toast.success("Şifren güncellendi 🎉");
      router.replace("/dashboard");
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 400
          ? "Token geçersiz veya süresi dolmuş — yeniden istek aç"
          : "Şifre sıfırlanamadı, lütfen tekrar dene";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        heading="Geçersiz bağlantı"
        description="Sıfırlama linki eksik. Lütfen yeniden istek aç."
      >
        <Link
          href="/forgot-password"
          className="block w-full rounded-md bg-foreground px-4 py-2.5 text-center text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Yeni istek aç
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={
        <>
          Yeni{" "}
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            şifreni
          </span>{" "}
          belirle
        </>
      }
      description="Bu link tek kullanımlık. Şifrenden sonra otomatik giriş yapacaksın."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Yeni şifre</Label>
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
              Sıfırlanıyor...
            </>
          ) : (
            "Şifreyi sıfırla"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
