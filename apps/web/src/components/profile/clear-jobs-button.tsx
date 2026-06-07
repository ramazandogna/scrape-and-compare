"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useJobs } from "@/hooks/use-jobs";

// ═══════════════════════════════════════════
// ClearJobsButton — Clear all of the user's listings
// ═══════════════════════════════════════════
// Confirm via AlertDialog → delete → loading → result toast

interface ClearJobsButtonProps {
  userId: string;
  jobCount: number;
}

export function ClearJobsButton({ userId, jobCount }: ClearJobsButtonProps) {
  const { removeAllJobs } = useJobs();
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    try {
      const result = await removeAllJobs(userId);
      toast.success(
        `${result.removedJobs} ilan ve ${result.removedMatches} puanlama sonucu temizlendi.`
      );
      setOpen(false);
    } catch {
      toast.error("İlanlar temizlenirken bir hata oluştu. Tekrar deneyin.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (jobCount === 0) return null;

  return (
    <Card className="border-red-200">
      <CardContent className="flex items-center gap-3 py-4">
        <Trash2 className="size-5 text-red-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">İlanlarımı Temizle</p>
          <p className="text-xs text-muted-foreground">
            {jobCount} ilanınız ve puanlama sonuçlarınız silinir
          </p>
        </div>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={<Button size="sm" variant="destructive" />}
          >
            <Trash2 className="size-4" />
            Temizle
          </AlertDialogTrigger>

          <AlertDialogContent>
            {isDeleting ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="size-10 animate-spin text-red-500" />
                <p className="text-sm text-muted-foreground">
                  İlanlarınız temizleniyor...
                </p>
              </div>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tüm ilanlar temizlenecek</AlertDialogTitle>
                  <AlertDialogDescription>
                    Bu işlem geri alınamaz. <strong>{jobCount}</strong> ilanınız
                    ve tüm AI puanlama sonuçlarınız kalıcı olarak silinecektir.
                    Devam etmek istediğinize emin misiniz?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirm}>
                    Evet, Tümünü Temizle
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
