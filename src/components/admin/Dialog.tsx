"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

export interface DialogProps {
  /** Controls visibility. When `false`, the dialog renders nothing. */
  open: boolean;
  /** Invoked on Escape key, backdrop click, or explicit consumer close action. */
  onClose: () => void;
  /**
   * id of the element that labels this dialog (wired via aria-labelledby).
   * Consumers generate one with `useId()` and place it on their heading.
   */
  titleId: string;
  /** Dialog contents — heading, form, actions, etc. */
  children: ReactNode;
  /** Additional classes merged into the inner card. Use to override sizing. */
  className?: string;
  /**
   * Optional element to focus when the dialog opens. If omitted the inner
   * card itself receives focus so keyboard users always have an anchor.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const CARD_BASE_CLASS =
  "w-full max-w-md rounded-2xl border border-border bg-background shadow-xl focus:outline-none";

/**
 * Reusable modal shell. Owns the backdrop, Escape-to-close, backdrop-to-close,
 * initial focus, body scroll-lock, and aria-modal plumbing. It intentionally
 * does NOT implement a full focus trap — Escape + backdrop click are enough
 * for the admin surface, per the Phase 2 design decision.
 */
export default function Dialog({
  open,
  onClose,
  titleId,
  children,
  className,
  initialFocusRef,
}: DialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Escape key closes the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the dialog on open — consumer-supplied target, else the card.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? cardRef.current;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, initialFocusRef]);

  // Lock body scroll while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleBackdropClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const cardClassName = className
    ? `${CARD_BASE_CLASS} ${className}`
    : CARD_BASE_CLASS;

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cardClassName}
      >
        {children}
      </div>
    </div>
  );
}
