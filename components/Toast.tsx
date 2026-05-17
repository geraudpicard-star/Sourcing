"use client";

import { useCallback, useEffect, useState } from "react";

export interface ToastState {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}

export function useToast() {
  const [state, setState] = useState<ToastState | null>(null);

  const show = useCallback(
    (message: string, tone: ToastState["tone"] = "info") => {
      setState({ id: Date.now(), message, tone });
    },
    [],
  );

  const clear = useCallback(() => setState(null), []);

  return { state, show, clear };
}

export default function Toast({ state }: { state: ToastState | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!state) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [state]);

  if (!state || !visible) return null;

  const tone =
    state.tone === "success"
      ? "bg-emerald-600 text-white"
      : state.tone === "error"
        ? "bg-red-600 text-white"
        : "bg-slate-900 text-white";

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
      <div
        className={`pointer-events-auto rounded-lg shadow-lg px-4 py-3 text-sm ${tone} flex items-center gap-2`}
      >
        <span aria-hidden>
          {state.tone === "success" ? "✓" : state.tone === "error" ? "✕" : "•"}
        </span>
        {state.message}
      </div>
    </div>
  );
}
