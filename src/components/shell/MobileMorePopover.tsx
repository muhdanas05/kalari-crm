"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { moreSections } from "./mobile-nav-config";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth/session";

type Props = {
  open: boolean;
  role: Role;
  onClose: () => void;
};

/**
 * ClickUp-style "More" bottom sheet: a slide-up panel with a grouped 3-column
 * grid of feature tiles. Structure borrowed from ClickUp; the palette is pure
 * TRE — every tile shares one neutral canvas-tinted square (no rainbow / no
 * per-feature colour). Tiles are flag-gated (navItemVisible); a section with no
 * visible items hides. Dismisses on tap-outside, ESC, or a downward drag on the
 * handle. The bottom tab bar stays visible above this (More slot highlighted).
 */
export function MobileMorePopover({ open, role, onClose }: Props) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  // Mount → next frame slide up; close → slide down then unmount.
  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  // ESC + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!render) return null;

  const sections = moreSections(role);

  const onHandleDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return;
    const dy = e.clientY - dragStart.current;
    if (dy > 0) setDragY(dy);
  };
  const onHandleUp = () => {
    if (dragY > 60) onClose();
    else setDragY(0);
    dragStart.current = null;
  };

  return (
    <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/30 transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0"
        )}
      />
      {/* Sheet — sits above the backdrop, below the z-50 tab bar */}
      <div
        className="absolute inset-x-0 bottom-0 z-[45] flex max-h-[85vh] flex-col overflow-hidden rounded-t-[20px] border-t border-line bg-surface shadow-floating transition-transform duration-200 ease-out"
        style={{
          transform: shown ? `translateY(${dragY}px)` : "translateY(100%)",
        }}
      >
        {/* Drag handle */}
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
        </div>

        {/* Grid — clears the floating tab bar at the bottom */}
        <div
          className="overflow-y-auto px-6 pt-1"
          style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}
        >
          {sections.map((section) => (
            <section key={section.title} className="mb-2">
              <h2 className="mb-3 mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mid font-medium">
                {section.title}
              </h2>
              <div className="grid grid-cols-3 gap-x-2 gap-y-5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="group flex flex-col items-center gap-2 rounded-xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist"
                    >
                      <span className="flex h-16 w-16 items-center justify-center rounded-[14px] bg-paper-deep text-ink transition-colors group-hover:bg-accent-mist group-hover:text-accent">
                        <Icon size={24} strokeWidth={1.9} />
                      </span>
                      <span className="text-center text-[13px] font-semibold leading-tight text-ink">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
