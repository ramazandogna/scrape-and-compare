"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordRequest } from "@/contexts/auth-context";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await forgotPasswordRequest(email);
      setDevToken(res.devToken);
      setSubmitted(true);
    } catch {
      // Sessizce sumitted kabul et — email enumeration'a karşı UX güvenliği
      setSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      heading={
        <>
          Şifreni{" "}
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            sıfırla
          </span>
        </>
      }
      description="Email adresini gir; eğer hesap varsa sıfırlama linki gönderilir."
      topRight={
        <span>
          <Link
            href="/sign-in"
            className="font-medium text-violet-600 hover:text-violet-700"
          >
            ← Girişe dön
          </Link>
        </span>
      }
    >
      {submitted ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-semibold">
              <Mail className="size-4" />
              Linki kontrol et
            </div>
            <p className="mt-1 text-xs leading-relaxed text-emerald-700">
              Eğer <strong>{email}</strong> sistemde varsa kısa süre içinde
              sıfırlama linki ulaşacak.
            </p>
          </div>

          {devToken && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              <p className="font-semibold">Geliştirme modu</p>
              <p className="mt-1 leading-relaxed">
                Mail servisi bağlı değil. Sıfırlama linki:
              </p>
              <Link
                href={`/reset-password?token=${devToken}`}
                className="mt-2 inline-block break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-violet-700 ring-1 ring-amber-200 hover:underline"
              >
                /reset-password?token={devToken}
              </Link>
            </div>
          )}
        </div>
      ) : (
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

          <Button
            type="submit"
            variant="hero"
            disabled={isLoading}
            className="h-11 w-full text-sm font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Gönderiliyor...
              </>
            ) : (
              "Sıfırlama linki gönder"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
