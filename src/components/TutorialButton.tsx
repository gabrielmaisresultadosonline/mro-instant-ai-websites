import { useState, useEffect } from "react";

const VIDEO_ID = "AvNxM8QH7Iw";

export function TutorialButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-bold text-brand-foreground shadow-[0_12px_30px_-6px_rgba(0,0,0,0.35)] hover:scale-105 transition sm:bottom-6 sm:right-6"
        aria-label="Abrir tutorial em vídeo"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-foreground/15 text-xs">▶</span>
        <span className="hidden sm:inline">Tutorial</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Tutorial MRO.BIO"
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-10 right-0 inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              aria-label="Fechar tutorial"
            >
              ✕ Fechar
            </button>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-white/10 bg-black shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
                title="Tutorial MRO.BIO"
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
