import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

/**
 * Portal-free Toaster — renders as a plain fixed div inside the React tree.
 * Does NOT use @radix-ui/react-toast or ReactDOM.createPortal so it works
 * reliably on Android WebView (Capacitor) without touch-event or z-index issues.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  const visible = toasts.filter((t) => t.open !== false);

  const visibleIds = visible.map((t) => t.id).join(",");
  useEffect(() => {
    if (visible.length === 0) return;
    const first = visible[0];
    const timer = setTimeout(() => dismiss(first.id), 3_000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);

  return (
    <div
      className="fixed bottom-24 inset-x-4 z-[200] flex flex-col gap-2 pointer-events-none"
      dir="rtl"
    >
      <AnimatePresence>
        {visible.map(({ id, title, description }) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="bg-slate-900 text-white text-sm font-bold px-4 py-3 rounded-2xl shadow-2xl pointer-events-auto"
          >
            {title && <p className="leading-snug">{title}</p>}
            {description && (
              <p className="text-xs font-normal mt-0.5 text-slate-300 leading-snug">
                {description}
              </p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
