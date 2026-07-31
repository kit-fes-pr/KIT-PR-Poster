'use client';

import { ReactNode, useEffect, useRef } from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  centered?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  contentClassName?: string;
};

export function Modal({
  open,
  onClose,
  children,
  centered = true,
  overlayClassName = '',
  panelClassName = '',
  contentClassName = '',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (!panel.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  const overlayBase = centered
    ? 'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4'
    : 'fixed inset-0 z-50 overflow-y-auto p-4';
  const panelBase = centered
    ? 'max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl'
    : 'mx-auto my-8 w-full overflow-hidden rounded-2xl bg-white shadow-2xl';

  return (
    <div
      role="presentation"
      className={`${overlayBase} bg-black/10 backdrop-blur-sm ${overlayClassName}`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`${panelBase} ${panelClassName}`}
      >
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );
}
