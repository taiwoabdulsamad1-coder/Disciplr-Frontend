import { act, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Ref, ReactNode } from "react";
import Notification from "../Notification";
import NotificationSettings from "../NotificationSettings";
import { useNotification } from "@/Zustand/Store";
import { getNotifications } from "@/components/Notification/exampleNotification/example";

vi.mock("framer-motion", () => {
  // @ts-expect-error -- require is needed inside vi.mock factory (hoisted before imports)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    motion: {
      div: React.forwardRef(
        ({ children, ...props }: Record<string, unknown>, ref: Ref<HTMLDivElement>) => (
          <div ref={ref} {...(props as JSX.IntrinsicElements["div"])}>
            {children as ReactNode}
          </div>
        ),
      ),
    },
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    useReducedMotion: () => false,
  };
});

vi.mock("focus-trap-react", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const initialNotifications = getNotifications();

function resetStore() {
  useNotification.setState({
    notification: initialNotifications,
  });
}

function renderNotification() {
  return render(
    <MemoryRouter>
      <Notification />
    </MemoryRouter>,
  );
}

describe("Notification page", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the first page of notifications", () => {
    renderNotification();
    const items = screen.getAllByText(/\.\.\./);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it("displays pagination info", () => {
    renderNotification();
    expect(
      screen.getByRole("navigation", { name: "Notifications pagination" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Notifications pagination" }),
    ).toBeInTheDocument();
  });

  it("navigates to the next page", () => {
    renderNotification();
    const nextButton = screen.getByRole("button", { name: "Go to next page" });
    fireEvent.click(nextButton);
    const totalPages = Math.ceil(initialNotifications.length / 5);
    expect(screen.getByText(`Page 2 of ${totalPages}`)).toBeInTheDocument();
  });

  it("disables previous button on first page", () => {
    renderNotification();
    const prevButton = screen.getByRole("button", {
      name: "Go to previous page",
    });
    expect(prevButton).toBeDisabled();
  });

  it("supports numbered page navigation", () => {
    renderNotification();
    fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }));
    const totalPages = Math.ceil(initialNotifications.length / 5);
    expect(
      screen.getByText(`Page 3 of ${totalPages}`),
    ).toBeInTheDocument();
  });

  it("filters by unread via the read filter dropdown", () => {
    renderNotification();

    const filterButton = screen.getByText("Filter");
    fireEvent.click(filterButton);

    const readSelect = document.querySelector(
      'select[name="filter_by_read"]',
    ) as HTMLSelectElement;
    fireEvent.change(readSelect, { target: { value: "0" } });

    const unreadCount = initialNotifications.filter((n) => !n.isRead).length;
    const expectedItems = Math.min(unreadCount, 5);
    const items = screen.getAllByText(/\.\.\./);
    expect(items.length).toBe(expectedItems);
  });

  it("shows empty state when no notifications match filter", () => {
    useNotification.setState({
      notification: initialNotifications.map((n) => ({
        ...n,
        isRead: true,
      })),
    });
    renderNotification();

    const filterButton = screen.getByText("Filter");
    fireEvent.click(filterButton);

    const readSelect = document.querySelector(
      'select[name="filter_by_read"]',
    ) as HTMLSelectElement;
    fireEvent.change(readSelect, { target: { value: "0" } });

    expect(screen.getByText("No notifications found.")).toBeInTheDocument();
  });

  it("marks a notification as read via the store", () => {
    const unreadNotification = initialNotifications.find((n) => !n.isRead)!;

    useNotification.getState().markRead(unreadNotification.id);

    const state = useNotification.getState();
    const updated = state.notification.find(
      (n) => n.id === unreadNotification.id,
    );
    expect(updated!.isRead).toBe(true);
  });

  it("ignores a stale dismiss action without changing notifications", () => {
    renderNotification();
    const before = useNotification.getState().notification;

    act(() => {
      useNotification.getState().dismiss("notification-that-no-longer-exists");
    });

    expect(useNotification.getState().notification).toEqual(before);
  });

  it("resets to page 1 when filter changes", () => {
    renderNotification();

    const nextButton = screen.getByRole("button", { name: "Go to next page" });
    fireEvent.click(nextButton);
    const totalPages = Math.ceil(initialNotifications.length / 5);
    expect(screen.getByText(`Page 2 of ${totalPages}`)).toBeInTheDocument();

    const filterButton = screen.getByText("Filter");
    fireEvent.click(filterButton);

    const readSelect = document.querySelector(
      'select[name="filter_by_read"]',
    ) as HTMLSelectElement;
    fireEvent.change(readSelect, { target: { value: "0" } });

    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });
  it("resets to page 1 when filter changes", () => {
    renderNotification();

    const nextButton = screen.getByRole("button", { name: "Go to next page" });
    fireEvent.click(nextButton);
    const totalPages = Math.ceil(initialNotifications.length / 5);
    expect(screen.getByText(`Page 2 of ${totalPages}`)).toBeInTheDocument();

    const filterButton = screen.getByText("Filter");
    fireEvent.click(filterButton);

    const readSelect = document.querySelector(
      'select[name="filter_by_read"]',
    ) as HTMLSelectElement;
    fireEvent.change(readSelect, { target: { value: "0" } });

    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });

  it("shows Clear all button when notifications exist", () => {
    renderNotification();
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("dismisses a single notification when the dismiss button is clicked", () => {
    renderNotification();
    const firstId = initialNotifications[0].id;
    const dismissButton = screen.getByLabelText(
      `Dismiss notification ${firstId}`,
    );
    fireEvent.click(dismissButton);
    const state = useNotification.getState();
    expect(state.notification.find((n) => n.id === firstId)).toBeUndefined();
    expect(state.notification.length).toBe(initialNotifications.length - 1);
  });

  it("opens the clear-all confirmation modal when Clear all is clicked", () => {
    renderNotification();
    const clearButton = screen.getByText("Clear all");
    fireEvent.click(clearButton);
    expect(screen.getByText("Clear all notifications")).toBeInTheDocument();
    expect(
      screen.getByText(
        `Are you sure you want to clear all ${initialNotifications.length} notifications? This action cannot be undone.`,
      ),
    ).toBeInTheDocument();
  });

  it("clears all notifications when confirmed in the modal", () => {
    renderNotification();
    const clearButton = screen.getByText("Clear all");
    fireEvent.click(clearButton);

    // Both the trigger button and modal confirm button say "Clear all"
    const confirmButton = screen.getAllByText("Clear all")[1];
    fireEvent.click(confirmButton);

    const state = useNotification.getState();
    expect(state.notification).toEqual([]);
    expect(state.notification.filter((n) => !n.isRead).length).toBe(0);
    expect(screen.getByText("No notifications found.")).toBeInTheDocument();
  });

  it("cancels clear-all when Cancel is clicked in the modal — notifications remain", () => {
    renderNotification();
    const clearButton = screen.getByText("Clear all");
    fireEvent.click(clearButton);

    const cancelButton = screen.getAllByText("Cancel")[0];
    fireEvent.click(cancelButton);

    const state = useNotification.getState();
    expect(state.notification.length).toBe(initialNotifications.length);
  });

  it("resets to page 1 when dismissing the last item on the current page", () => {
    // Set up a small list so page 2 exists with 1 item
    const smallList = initialNotifications.slice(0, 6);
    useNotification.setState({
      notification: smallList,
    });
    renderNotification();

    // Go to page 2
    const nextButton = screen.getByRole("button", { name: "Go to next page" });
    fireEvent.click(nextButton);
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();

    // Dismiss the only item on page 2 (item at index 5)
    const lastItemId = smallList[5].id;
    const dismissButton = screen.getByLabelText(
      `Dismiss notification ${lastItemId}`,
    );
    fireEvent.click(dismissButton);

    // Should reset to page 1
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
  });

  describe("Accessibility", () => {
    it("has correct accessible name and aria-expanded attribute on the Filter button", () => {
      renderNotification();
      const filterButton = screen.getByRole("button", { name: /filter notifications/i });
      expect(filterButton).toBeInTheDocument();
      expect(filterButton).toHaveAttribute("aria-expanded", "false");
      expect(filterButton).toHaveAttribute("aria-controls", "notification-filter-panel");

      fireEvent.click(filterButton);
      expect(filterButton).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(filterButton);
      expect(filterButton).toHaveAttribute("aria-expanded", "false");
    });

    it("has correct accessible name on the settings link", () => {
      renderNotification();
      const settingsLink = screen.getByRole("link", { name: /notification preferences/i });
      expect(settingsLink).toBeInTheDocument();
    });

    it("announces filtered result counts and active filters in the live region", () => {
      renderNotification();
      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toBeInTheDocument();
      
      const expectedInitialCount = initialNotifications.length;
      expect(liveRegion.textContent).toBe(
        `Showing ${expectedInitialCount} notifications. Active filters: status all, category all categories.`
      );

      // Open filter panel
      const filterButton = screen.getByRole("button", { name: /filter notifications/i });
      fireEvent.click(filterButton);

      // Select Unread status filter
      const readSelect = document.querySelector('select[name="filter_by_read"]') as HTMLSelectElement;
      fireEvent.change(readSelect, { target: { value: "0" } });

      const unreadCount = initialNotifications.filter((n) => !n.isRead).length;
      expect(liveRegion.textContent).toBe(
        `Showing ${unreadCount} notifications. Active filters: status unread, category all categories.`
      );

      // Select system category filter
      const typeSelect = document.querySelector('select[name="filter_by_type"]') as HTMLSelectElement;
      fireEvent.change(typeSelect, { target: { value: "system" } });

      const filteredCount = initialNotifications.filter((n) => !n.isRead && n.category === "system").length;
      if (filteredCount === 0) {
        expect(liveRegion.textContent).toBe(
          "No notifications found. Active filters: status unread, category system."
        );
      } else {
        const countText = filteredCount === 1 ? "1 notification" : `${filteredCount} notifications`;
        expect(liveRegion.textContent).toBe(
          `Showing ${countText}. Active filters: status unread, category system.`
        );
      }
    });

    it("announces 'No notifications found' when filter matches nothing", () => {
    useNotification.setState({
      notification: initialNotifications.map((n) => ({
        ...n,
        isRead: true,
      })),
    });
    renderNotification();
      const liveRegion = screen.getByRole("status");

      // Open filter panel
      const filterButton = screen.getByRole("button", { name: /filter notifications/i });
      fireEvent.click(filterButton);

      // Select Unread status filter
      const readSelect = document.querySelector('select[name="filter_by_read"]') as HTMLSelectElement;
      fireEvent.change(readSelect, { target: { value: "0" } });

      expect(liveRegion.textContent).toBe(
        `No notifications found. Active filters: status unread, category all categories.`
      );
    });

    it("closes the filter panel and restores focus when Escape key is pressed", () => {
      renderNotification();
      const filterButton = screen.getByRole("button", { name: /filter notifications/i });
      
      // Open panel
      fireEvent.click(filterButton);
      expect(filterButton).toHaveAttribute("aria-expanded", "true");

      const readSelect = document.querySelector('select[name="filter_by_read"]') as HTMLSelectElement;
      readSelect.focus();
      expect(document.activeElement).toBe(readSelect);

      // Press Escape
      fireEvent.keyDown(document, { key: "Escape" });
      expect(filterButton).toHaveAttribute("aria-expanded", "false");
      expect(document.activeElement).toBe(filterButton);
    });

    it("restores focus when click outside closes the filter panel", () => {
      renderNotification();
      const filterButton = screen.getByRole("button", { name: /filter notifications/i });
      
      // Open panel
      fireEvent.click(filterButton);
      expect(filterButton).toHaveAttribute("aria-expanded", "true");

      const readSelect = document.querySelector('select[name="filter_by_read"]') as HTMLSelectElement;
      readSelect.focus();
      expect(document.activeElement).toBe(readSelect);

      // Click outside (on the body or some other element outside containerRef)
      fireEvent.mouseDown(document.body);
      expect(filterButton).toHaveAttribute("aria-expanded", "false");
      expect(document.activeElement).toBe(filterButton);
    });

    it("marks a notification as read when clicking on the message content", () => {
      renderNotification();
      const firstUnread = initialNotifications.find((n) => !n.isRead)!;
      
      // The message title is rendered
      const titleElement = screen.getByText(firstUnread.title);
      fireEvent.click(titleElement);

      const state = useNotification.getState();
      const updated = state.notification.find((n) => n.id === firstUnread.id);
      expect(updated!.isRead).toBe(true);
    });
  });

  describe("navigation to settings", () => {
    it("navigates from the bell icon through to the settings screen", () => {
      render(
        <MemoryRouter initialEntries={["/notifications"]}>
          <Routes>
            <Route path="/notifications" element={<Notification />} />
            <Route path="/notifications/settings" element={<NotificationSettings />} />
          </Routes>
        </MemoryRouter>,
      );

      const settingsLink = screen.getByRole("link", {
        name: "Notification Preferences",
      });
      expect(settingsLink).toHaveAttribute("href", "/notifications/settings");

      fireEvent.click(settingsLink);

      expect(
        screen.getByRole("heading", { name: "Notification Settings" }),
      ).toBeInTheDocument();
    });
  });
});

describe("Notification page with a large inbox", () => {
  // More than FULL_PAGE_LIST_LIMIT * itemsPerPage, so the windowed pagination
  // (and with it the jump control) is actually engaged.
  const bulkNotifications = Array.from({ length: 45 }, (_, index) => ({
    ...initialNotifications[0],
    id: `ntf_bulk_${index}`,
  }));

  beforeEach(() => {
    useNotification.setState({ notification: bulkNotifications });
  });

  it("keeps the numbered controls bounded and offers a jump control", () => {
    renderNotification();

    expect(screen.getByText("Page 1 of 9")).toBeInTheDocument();

    const pageButtons = screen
      .getAllByRole("button")
      .filter((button) => /^Go to page \d+$/.test(button.getAttribute("aria-label") ?? ""));
    // The documented near-start window: 1 2 3 4 5 … 9. Nothing scales with 45 items.
    expect(pageButtons).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Go to page 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to page 9" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Go to page 7" }),
    ).not.toBeInTheDocument();

    expect(screen.getByLabelText("Jump to page")).toBeInTheDocument();
  });

  it("jumps straight to a page the window does not show", () => {
    renderNotification();

    const input = screen.getByLabelText("Jump to page");
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(screen.getByText("Page 8 of 9")).toBeInTheDocument();
  });
});
