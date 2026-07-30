"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

/**
 * Bottom sheet. Used for Log Call (§6 — "Bottom sheet; didn't-reach = one tap"),
 * which is opened on a phone, one-handed, standing outside a government office.
 * Drag-to-dismiss on the handle; tap-outside and ESC also close.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setRender(true);
      setDragY(0);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  // Same reasoning as Modal: callers pass an inline arrow, so keeping onClose
  // in the deps tore down and rebuilt this listener on every keystroke. No
  // focus() here so it never caused the caret bug, but it is pure churn.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!render || typeof document === "undefined") return null;

  const onDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return;
    const dy = e.clientY - dragStart.current;
    if (dy > 0) setDragY(dy);
  };
  const onUp = () => {
    if (dragY > 60) onClose();
    else setDragY(0);
    dragStart.current = null;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          "absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col overflow-hidden rounded-t-[20px] border-t border-line bg-surface shadow-floating transition-transform duration-200 ease-out sm:inset-x-auto sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2"
        style={{
          transform: shown
            ? `translateY(${dragY}px)`
            : "translateY(100%)",
        }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
        </div>

        <h2 className="shrink-0 px-6 pb-3 pt-2 text-base font-bold tracking-[-0.2px] text-ink">
          {title}
        </h2>

        <div
          className="overflow-y-auto px-6"
          style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
