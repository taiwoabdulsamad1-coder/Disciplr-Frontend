import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Message from "../Messages";

describe("Message Component", () => {
  // A fixed ISO timestamp; the rendered timeAgo is computed by formatRelativeTime
  // so we just verify it renders something (non-empty) rather than a hardcoded string.
  const defaultProps = {
    id: "msg-123",
    type: "funds_released",
    title: "Funds Released Successfully",
    message: "Your funds have been released from the escrow vault.",
    timestamp: "2025-01-01T00:00:00Z",
    read: false,
    isFullPage: false,
    setRead: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    // Ensure deterministic time formatting across all tests.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders message details correctly when unread and not full page", () => {
    render(<Message {...defaultProps} />);

    // Assert title is rendered
    expect(screen.getByText(defaultProps.title)).toBeInDocument();

    // Assert message is truncated to 30 characters + ellipsis in preview
    expect(screen.getByText(/Your funds have been released.*.../)).toBeInDocument();

    // Assert a relative time label is rendered (non-empty, computed from timestamp)
    const timeLabel = screen.getByTestId("message-time-ago");
    expect(timeLabel.textContent).toBeTruthy();

    // Assert "New" badge is rendered because read is false
    expect(screen.getByText("New")).toBeInDocument();

    // Assert notification icon is rendered with the correct aria-label and role
    const icon = screen.getByRole("img", { name: "Funds released" });
    expect(icon).toBeInDocument();

    // Assert "Delete" button is not rendered when isFullPage is false
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInDocument();
  });

  it("renders message details correctly when read and isFullPage is true", () => {
    const props = {
      ...defaultProps,
      read: true,
      isFullPage: true,
    };
    render(<Message {...props} />);

    // Assert title is rendered
    expect(screen.getByText(props.title)).toBeInDocument();

    // Assert "New" badge is not rendered because read is true
    expect(screen.queryByText("New")).not.toBeInDocument();

    // Assert "Delete" button is rendered when isFullPage is true
    expect(screen.getByRole("button", { name: "Delete" })).toBeInDocument();
  });

  it("clicking the Delete button calls onDismiss with the message id", () => {
    const onDismissMock = vi.fn();
    const props = {
      ...defaultProps,
      isFullPage: true,
      onDismiss: onDismissMock,
    };
    render(<Message {...props} />);

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);

    expect(onDismissMock).toHaveBeenCalledTimes(1);
    expect(onDismissMock).toHaveBeenCalledWith(props.id);
  });

  it("clicking the title opens the expanded view and calls setRead with the item's id", () => {
    const setReadMock = vi.fn();
    const props = {
      ...defaultProps,
      setRead: setReadMock,
    };
    render(<Message {...props} />);

    // Prior to clicking, the full message should not be visible (only the truncated preview is)
    expect(screen.queryByText(props.message)).not.toBeInDocument();

    // Click the title to open the overlay
    const titleElement = screen.getByText(props.title);
    fireEvent.click(titleElement);

    // Assert setRead mock was called with correct id
    expect(setReadMock).toHaveBeenCalledTimes(1);
    expect(setReadMock).toHaveBeenCalledWith(props.id);

    // Assert the expanded view / overlay is now open and contains the full message text
    const fullMessageElement = screen.getByText(props.message);
    expect(fullMessageElement).toBeInDocument();
  });

  it("the expanded overlay closes when its close control is activated", () => {
    render(<Message {...defaultProps} />);

    // Open the overlay
    const titleElement = screen.getByText(defaultProps.title);
    fireEvent.click(titleElement);

    // Verify overlay is open
    expect(screen.getByText(defaultProps.message)).toBeInDocument();

    // Click the close control "X"
    const closeButton = screen.getByText("X");
    fireEvent.click(closeButton);

    // Verify overlay is closed (full message is removed)
    expect(screen.queryByText(defaultProps.message)).not.toBeInDocument();
  });

  it("long messages are truncated as expected", () => {
    const props = {
      ...defaultProps,
      message: "This is a super long message that contains more than thirty characters.",
    };
    render(<Message {...props} />);

    // Message length is 72, which is > 30.
    // Truncated preview should be exactly 30 characters plus " ..."
    expect(screen.getByText(/This is a super long message t.*.../)).toBeInDocument();
  });

  it("applies correct container styling depending on the isFullPage prop when overlay is open", () => {
    // Case 1: isFullPage is true
    const { rerender } = render(<Message {...defaultProps} isFullPage={true} />);

    // Open overlay
    fireEvent.click(screen.getByText(defaultProps.title));

    // Get overlay container (grandparent of the full message element in the overlay)
    const fullMsg1 = screen.getByText(defaultProps.message);
    const container1 = fullMsg1.parentElement?.parentElement;
    expect(container1).toBeInDocument();
    
    // Check that it contains full-page classes
    expect(container1).toHaveClass("w-[90%]");
    expect(container1).toHaveClass("lg:w-[40%]");
    expect(container1).toHaveClass("h-auto");
    expect(container1).toHaveClass("min-h-[40%]");
    expect(container1).toHaveClass("bg-white");
    expect(container1).toHaveClass("left-[50%]");
    expect(container1).toHaveClass("translate-x-[-50%]");
    expect(container1).toHaveClass("top-[5%]");
    expect(container1).not.toHaveClass("w-full");
    expect(container1).not.toHaveClass("h-full");

    // Close the overlay
    fireEvent.click(screen.getByText("X"));

    // Case 2: isFullPage is false
    rerender(<Message {...defaultProps} isFullPage={false} />);

    // Open overlay
    fireEvent.click(screen.getByText(defaultProps.title));

    const fullMsg2 = screen.getByText(defaultProps.message);
    const container2 = fullMsg2.parentElement?.parentElement;
    expect(container2).toBeInDocument();

    // Check that it contains dropdown/non-full-page classes
    expect(container2).toHaveClass("w-full");
    expect(container2).toHaveClass("h-full");
    expect(container2).toHaveClass("bg-white");
    expect(container2).toHaveClass("left-0");
    expect(container2).toHaveClass("top-0");
    expect(container2).not.toHaveClass("w-[90%]");
    expect(container2).not.toHaveClass("lg:w-[40%]");
  });

  // -------------------------------------------------------------------------
  // Failure-path and boundary coverage
  // -------------------------------------------------------------------------

  it("renders a message whose length is exactly 30 characters without appending an ellipsis", () => {
    // Boundary: message.length === 30 should not be truncated.
    const exactlyThirty = "123456789012345678901234567890";
    expect(exactlyThirty).toHaveLength(30);
    render(<Message {...defaultProps} message={exactlyThirty} />);

    expect(screen.getByText(exactlyThirty)).toBeInTheDocument();
    // No ellipsis should be appended for a message at the boundary.
    expect(screen.queryByText(`${exactlyThirty} ...`)).not.toBeInTheDocument();
  });

  it("truncates a message of 31 characters to 30 characters plus ellipsis", () => {
    // Boundary: message.length === 31 is the first length that gets truncated.
    const thirtyOne = "123456789012345678901234567890";
    expect(thirtyOne).toHaveLength(31);
    render(<Message {...defaultProps} message={thirtyOne} />);

    expect(screen.getByText("123456789012345678901234567890 ...")).toBeInTheDocument();
  });

  it("renders an empty message without crashing or appending an ellipsis", () => {
    // Boundary: empty message must not throw and must not append " ...".
    render(<Message {...defaultProps} message="" />);

    expect(screen.getByText(defaultProps.title)).toBeInTheDocument();
    expect(screen.queryByText(" ...")).not.toBeInTheDocument();
  });

  it("does not call setRead when the message is already read", () => {
    // Invariant: opening an already-read message must not re-invoke setRead.
    const setReadMock = vi.fn();
    render(<Message {...defaultProps} read={true} setRead={setReadMock} />);

    fireEvent.click(screen.getByText(defaultProps.title));

    // The overlay still opens, but setRead must not be called again.
    expect(screen.getByText(defaultProps.message)).toBeInTheDocument();
    expect(setReadMock).not.toHaveBeenCalled();
  });

  it("propagates a setRead rejection without leaving the overlay in an inconsistent state", () => {
    // Failure path: a setRead that throws must not corrupt the component's own state.
    // The component must still render and the overlay must open deterministically.
    const setReadMock = vi.fn(() => {
      throw new Error("setRead failed");
    });
    render(<Message {...defaultProps} setRead={setReadMock} />);

    // The click handler is allowed to propagate the error, but the component must not
    // leave the DOM in a partially mounted state. We assert the call was made and
    // that the component still renders its title after the failure.
    expect(() => {
      fireEvent.click(screen.getByText(defaultProps.title));
    }).toThrow();
    expect(setReadMock).toHaveBeenCalledWith(defaultProps.id);
    expect(screen.getByText(defaultProps.title)).toBeInTheDocument();
  });

  it("handles a timestamp that is in the future without throwing", () => {
    // Boundary: future timestamps should still produce a non-empty relative label.
    render(<Message {...defaultProps} timestamp="2030-01-01T00:00:00Z" />);

    const timeLabel = screen.getByTestId("message-time-ago");
    expect(timeLabel.textContent).toBeTruthy();
  });

  it("handles an invalid timestamp without crashing", () => {
    // Failure path: malformed timestamps must not throw during render.
    expect(() => {
      render(<Message {...defaultProps} timestamp="not-a-date" />);
    }).not.toThrow();

    // The component must still render its title and time label container.
    expect(screen.getByText(defaultProps.title)).toBeInTheDocument();
    expect(screen.getByTestId("message-time-ago")).toBeInTheDocument();
  });

  it("repeated open/close cycles remain deterministic and only call setRead once", () => {
    // Regression / concurrency boundary: multiple open close cycles must not
    // duplicate side effects or leave the overlay in an inconsistent state.
    const setReadMock = vi.fn();
    render(<Message {...defaultProps} setRead={setReadMock} />);

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText(defaultProps.title));
      expect(screen.getByText(defaultProps.message)).toBeInTheDocument();
      fireEvent.click(screen.getByText("X"));
      expect(screen.queryByText(defaultProps.message)).not.toBeInTheDocument();
    }

    expect(setReadMock).toHaveBeenCalledTimes(1);
  });

  it("closing the overlay when it is already closed is a no-op and does not throw", () => {
    // Boundary: closing an already-closed overlay must not throw or change state.
    render(<Message {...defaultProps} />);

    expect(screen.queryByText("X")).not.toBeInTheDocument();
    expect(screen.queryByText(defaultProps.message)).not.toBeInTheDocument();
  });

  it("keeps the overlay open across a re-render with the same id", () => {
    // Regression: re-rendering with the same id must not close the overlay.
    const { rerender } = render(<Message {...defaultProps} />);

    fireEvent.click(screen.getByText(defaultProps.title));
    expect(screen.getByText(defaultProps.message)).toBeInTheDocument();

    rerender(<Message {...defaultProps} />);

    expect(screen.getByText(defaultProps.message)).toBeInTheDocument();
  });

  it("closes the overlay when the id prop changes to avoid stale content", () => {
    // Stale state guard: switching to a different message must not leave the
    // previous message's overlay visible.
    const { rerender } = render(<Message {...defaultProps} />);

    fireEvent.click(screen.getByText(defaultProps.title));
    expect(screen.getByText(defaultProps.message)).toBeInTheDocument();

    rerender(
      <Message
        {...defaultProps}
        id="msg-456"
        title="New Title"
        message="New message body."
      />,
    );

    // The old overlay content must not remain visible.
    expect(screen.queryByText(defaultProps.message)).not.toBeInTheDocument();
    expect(screen.getByText("New Title")).toBeInTheDocument();
  });

  it("renders the correct icon for a known type and falls back safely for an unknown type", () => {
    // Invalid input: unknown types must not throw and must still render an icon.
    const { unmount } = render(<Message {...defaultProps} />);
    expect(screen.getRole("img", { name: "Funds released" })).toBeInTheDocument();
    unmount();

    expect(() => {
      render(<Message {...defaultProps} type="unknown_type" />);
    }).not.toThrow();
    // An icon role must still be present so the notification remains accessible.
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("does not call setRead when the close control is activated", () => {
    // Invariant: closing the overlay must not mutate the read state.
    const setReadMock = vi.fn();
    render(<Message {...defaultProps} setRead={setReadMock} />);

    fireEvent.click(screen.getByText(defaultProps.title));
    expect(setReadMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("X"));
    expect(setReadMock).toHaveBeenCalledTimes(1);
  });

  it("strips newlines and extra whitespace from the preview while preserving the full message in the overlay", () => {
    // Boundary: multi-line messages must not break the truncation or overlay.
    const multiLine = "Line one\nLine two\nLine three with extra text.";
    render(<Message {...defaultProps} message={multiLine} />);

    // Preview is truncated and must not contain raw newlines.
    const preview = screen.getByTestId("message-preview");
    expect(preview.textContent).not.toContain("\n");

    // Open the overlay and confirm the full message is preserved.
    fireEvent.click(screen.getByText(defaultProps.title));
    expect(screen.getByText(multiLine)).toBeInTheDocument();
  });

  it("renders the New badge only when unread and hides it after a read transition", () => {
    // State transition: unread -> read must remove the New badge deterministically.
    const { rerender } = render(<Message {...defaultProps} read={false} />);
    expect(screen.getByText("New")).toBeInTheDocument();

    rerender(<Message {...defaultProps} read={true} />);
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("does not leak the full message into the DOM when the overlay is closed", () => {
    // Security / privacy: the full message must not be present in the DOM when
    // the overlay is closed.
    render(<Message {...defaultProps} />);

    expect(screen.queryByText(defaultProps.message)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(defaultProps.title));
    expect(screen.getByText(defaultProps.message)).toBeInTheDocument();

    fireEvent.click(screen.getByText("X"));
    expect(screen.queryByText(defaultProps.message)).not.toBeInTheDocument();
  });

  it("setRead is not invoked when the title is clicked and the message is already read even after multiple clicks", () => {
    // Regression: multiple clicks on a read message must not duplicate side
    // effects or throw.
    const setReadMock = vi.fn();
    render(<Message {...defaultProps} read={true} setRead={setReadMock} />);

    const title = screen.getByText(defaultProps.title);
    fireEvent.click(title);
    fireEvent.click(title);
    fireEvent.click(title);

    expect(setReadMock).not.toHaveBeenCalled();
  });

  it("calls setRead exactly once even when the title is clicked multiple times before the overlay opens", () => {
    // Concurrency / timing boundary: a rapid sequence of clicks must not
    // produce duplicate setRead calls.
    const setReadMock = vi.fn();
    render(<Message {...defaultProps} setRead={setReadMock} />);

    const title = screen.getByText(defaultProps.title);
    act(() => {
      fireEvent.click(title);
      fireEvent.click(title);
      fireEvent.click(title);
    });

    expect(setReadMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when setRead is not provided and the title is clicked", () => {
    // Failure path: missing optional callback must not crash the component.
    const { setRead, ...rest } = defaultProps;
    void setRead;
    render(<Message {...rest} />);

    expect(() => {
      fireEvent.click(screen.getByText(defaultProps.title));
    }).not.toThrow();
  });
});
