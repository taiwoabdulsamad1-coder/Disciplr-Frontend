import { CiBellOn, CiBellOff } from "react-icons/ci";
import Message from "./Messages";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { transitionEnter } from "../../utils/motion";
import { usePrefersReducedMotion } from "../../utils/usePrefersReducedMotion";
import { Link } from "react-router-dom";
import { useNotification } from "@/Zustand/Store";

/**
 * Notification bell invariants (enforced below and covered by
 * src/components/Notification/__tests__/NotificationIcon.test.tsx):
 *
 * 1. Badge, aria-label and list are derived from the same normalized
 *    projection of the store, so they can never disagree with each other.
 * 2. Normalization rejects hostile store entries (non-arrays, nulls, missing
 *    ids, non-string fields): they are dropped instead of crashing rendering
 *    or `Message`. Duplicate ids are collapsed, first occurrence wins — which
 *    matches the store's `markRead` (it updates the first matching index), so
 *    clicking a visible row always marks the row that is visible.
 * 3. Read-state transitions go through the store's functional mutators
 *    (`markRead` / `markAllRead`) instead of a snapshot copied at render
 *    time, so a notification arriving between render and click can neither be
 *    dropped nor reverted (no lost updates under concurrency).
 * 4. "Mark All As Read" is idempotent: while there is no unread row the
 *    store is not touched at all, so repeat/duplicate clicks cannot churn
 *    state.
 * 5. The badge display is clamped at 99+ so extreme unread counts cannot
 *    overflow the bell; the accessible label always reports the exact count.
 * 6. The dropdown closes on Escape and on outside pointer-down, and re-opening
 *    is driven purely by `isOpen`, so state transitions are deterministic.
 */

/** Rows rendered in the dropdown preview list. */
const PREVIEW_LIMIT = 5;
/** Unread badge display clamp; the aria-label keeps the exact count. */
const BADGE_LIMIT = 99;

type DisplayNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
};

/**
 * Projects raw store entries into the shape the preview list renders.
 * Invalid entries are dropped and ids are de-duplicated (first wins).
 */
function toDisplayNotifications(input: unknown): DisplayNotification[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const rows: DisplayNotification[] = [];

  input.forEach((raw) => {
    if (typeof raw !== "object" || raw === null) return;
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) return;
    if (seen.has(record.id)) return;
    seen.add(record.id);

    rows.push({
      id: record.id,
      type: typeof record.type === "string" ? record.type : "",
      title: typeof record.title === "string" ? record.title : "Notification",
      message: typeof record.message === "string" ? record.message : "",
      timestamp: typeof record.timestamp === "string" ? record.timestamp : "",
      // Missing flags count as unread, matching `useUnreadCount`.
      isRead: record.isRead === true,
    });
  });

  return rows;
}

export default function NotificationIcon() {
  const [isOpen, setIsOpen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const storeNotifications = useNotification((state) => state.notification);
  const markRead = useNotification((state) => state.markRead);
  const markAllRead = useNotification((state) => state.markAllRead);

  const notifications = useMemo(
    () => toDisplayNotifications(storeNotifications),
    [storeNotifications],
  );
  const recentNotifications = useMemo(
    () => notifications.slice(0, PREVIEW_LIMIT),
    [notifications],
  );
  const unread = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );

  const badgeLabel = unread > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(unread);

  const markAllAsRead = () => {
    // Idempotent no-op: a repeat click on an all-read list leaves the store
    // (and its array identity) untouched.
    if (unread === 0) return;
    markAllRead();
  };

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Escape closes the open dropdown; no listener is registered while closed.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const dropdownMotion = prefersReducedMotion
    ? {
        initial: { opacity: 1, y: 0, scale: 1 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: -10, scale: 0.95 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -10, scale: 0.95 },
        transition: transitionEnter,
      };

  return (
    <>
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          aria-label={
            unread > 0
              ? `Toggle notifications, ${unread} unread`
              : "Toggle notifications"
          }
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={() => {
            setIsOpen((prev) => !prev);
          }}
          className="cursor-pointer bg-transparent border-0 p-0"
        >
          {unread > 0 ? (
            <CiBellOn size="2rem" />
          ) : (
            <CiBellOff size="2rem" />
          )}

          {unread > 0 && (
            <div
              aria-hidden="true"
              className="absolute top-0 right-0 h-5 w-5 bg-red-500 text-white flex items-center justify-center rounded-full text-[10px] font-bold transform translate-x-1/2 -translate-y-1/2"
            >
              {badgeLabel}
            </div>
          )}
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={dropdownMotion.initial}
              animate={dropdownMotion.animate}
              exit={dropdownMotion.exit}
              transition={dropdownMotion.transition}
              className="absolute w-[300px] h-[500px] bg-white shadow-2xl mt-2 -translate-x-[90%]"
              style={{ zIndex: "var(--z-index-drawer)" }}
            >
              <div className="w-full h-full flex flex-col items-center justify-between pb-5">
                <div className="w-full flex flex-col justify-center items-center">
                  <div className="flex justify-between items-center py-3 gap-10 px-2" style={{ background: "var(--surface)" }}>
                    <h2 className="text-white font-bold text-xl">
                      Notifications
                    </h2>
                    <button
                      onClick={markAllAsRead}
                      className="bg-white px-3 rounded-lg shadow-lg" style={{ color: "var(--accent)" }}
                    >
                      Mark All As Read
                    </button>
                  </div>
                  <div className="flex w-full flex-col gap-5 mt-5 max-h-[330px] overflow-y-auto">
                    {recentNotifications.map((item) => (
                      <div key={item.id} className="w-full px-2">
                        <Message
                          id={item.id}
                          title={item.title}
                          message={item.message}
                          timestamp={item.timestamp}
                          type={item.type}
                          read={item.isRead}
                          isFullPage={false}
                          setRead={markRead}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <Link
                  to="/notification"
                  style={{
                    color: "var(--surface)",
                    background: "var(--accent)",
                    padding: "0.5rem 1rem",
                    borderRadius: "var(--radius-full)",
                    textDecoration: "none",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  View All Notification
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
