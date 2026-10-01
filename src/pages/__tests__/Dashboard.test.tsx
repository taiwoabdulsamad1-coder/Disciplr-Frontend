import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import Dashboard from "../Dashboard";
import VaultCard from "../../components/VaultCard";
import { MASTER_VAULTS } from "../../fixtures/vaults";
import { computeDashboardSummary } from "../../utils/dashboard";
import { listVaults } from "../../services/vaultService";
import type { Vault } from "../../types/vault";

// Dashboard fetches its vault list asynchronously via vaultService.listVaults()
// rather than accepting vaults/summary as props, so tests mock that service
// call and await the resulting render instead of passing data in directly.
vi.mock("../../services/vaultService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/vaultService")>();
  return { ...actual, listVaults: vi.fn(actual.listVaults) };
});

const mockedListVaults = vi.mocked(listVaults);

function buildVault(overrides: Partial<Vault>): Vault {
  return {
    id: "1",
    name: "Test Vault",
    status: "active",
    amount: 1000,
    currency: "USDC",
    createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    deadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    creatorAddress: "GCREATOR",
    successAddress: "GSUCCESS",
    failureAddress: "GFAILURE",
    contractAddress: "GCONTRACT",
    milestones: [],
    transactions: [],
    ...overrides,
  };
}

describe("Dashboard page", () => {
  beforeEach(() => {
    mockedListVaults.mockClear();
  });

  test("renders successfully with real vault data once loaded", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Verify header title
    expect(
      screen.getByRole("heading", { level: 1, name: /Dashboard/i }),
    ).toBeInTheDocument();

    // Verify cards and sections
    expect(screen.getByText(/Total Locked/i)).toBeInTheDocument();
    const expectedActiveVaults = computeDashboardSummary(
      Object.values(MASTER_VAULTS),
    ).activeVaults;
    await waitFor(() => {
      expect(
        screen.getByText(/Active Vaults/i, { selector: ".text-caption" })
          .parentElement,
      ).toHaveTextContent(String(expectedActiveVaults));
    });
    expect(screen.getByText(/Pending Milestones/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Recent Activity/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Upcoming Deadlines/i }),
    ).toBeInTheDocument();
  });

  test("renders empty state when no vaults are returned", async () => {
    mockedListVaults.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Verify empty state message
    await waitFor(() => {
      expect(screen.getByText(/No vaults yet/i)).toBeInTheDocument();
    });
  });

  test("renders the at-risk section once vaults with critical or soon deadlines load", async () => {
    // Soon: pending_validation vault due in 3 days.
    const soonVault = buildVault({
      id: "soon-1",
      name: "Soon Vault",
      status: "pending_validation",
      deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    // Critical: active vault due in 12 hours.
    const criticalVault = buildVault({
      id: "critical-1",
      name: "Critical Vault",
      status: "active",
      deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    });
    // Safe: active vault due far in the future — should be excluded.
    const safeVault = buildVault({
      id: "safe-1",
      name: "Safe Vault",
      status: "active",
      deadline: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    });

    mockedListVaults.mockResolvedValueOnce([
      soonVault,
      criticalVault,
      safeVault,
    ]);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/⚠️ At Risk/)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/These vaults need immediate attention/),
    ).toBeInTheDocument();

    // Scope to the At Risk section itself: Soon/Critical Vault also appear in
    // the main vault list below, so assert membership within this section only.
    // The "immediate attention" copy is a <p> whose direct parent is the
    // section's outer container (the heading's own parent is only the
    // SectionHeader title row), so anchor on that instead.
    const atRiskSection = screen
      .getByText(/These vaults need immediate attention/)
      .closest("div");
    expect(atRiskSection).toBeInTheDocument();
    expect(
      within(atRiskSection as HTMLElement).getByText("Soon Vault"),
    ).toBeInTheDocument();
    expect(
      within(atRiskSection as HTMLElement).getByText("Critical Vault"),
    ).toBeInTheDocument();
    expect(
      within(atRiskSection as HTMLElement).queryByText("Safe Vault"),
    ).not.toBeInTheDocument();
  });

  test("does not render the at-risk section when no vaults are at risk", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: /Dashboard/i }),
      ).toBeInTheDocument();
    });
    // MASTER_VAULTS fixture deadlines are all outside the "soon" window.
    expect(screen.queryByText(/⚠️ At Risk/)).not.toBeInTheDocument();
  });

  test("memoized VaultCard does not re-render when an ancestor re-renders", async () => {
    const spy = vi.spyOn(VaultCard, "type");

    const safeDeadline = new Date(Date.now() + 30 * 86_400_000).toISOString();
    // Names deliberately avoid the dashboard fixtures (ACTIVITY/DEADLINES
    // already contain a vault called "Alpha Vault").
    mockedListVaults.mockResolvedValueOnce([
      buildVault({ id: "1", name: "Memo Vault One", deadline: safeDeadline }),
      buildVault({ id: "2", name: "Memo Vault Two", deadline: safeDeadline }),
    ]);

    function Ancestor() {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button onClick={() => setCount((c) => c + 1)}>
            Re-render ancestor ({count})
          </button>
          <Dashboard />
        </div>
      );
    }

    render(
      <MemoryRouter>
        <Ancestor />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText("Memo Vault One progress"),
      ).toBeInTheDocument(),
    );

    const rendersAfterMount = spy.mock.calls.length;
    expect(rendersAfterMount).toBe(2);

    fireEvent.click(
      screen.getByRole("button", { name: /Re-render ancestor/i }),
    );

    // The ancestor's state change re-renders Dashboard, but each VaultCard
    // receives identical props and must not re-render.
    expect(spy.mock.calls.length).toBe(rendersAfterMount);

    spy.mockRestore();
  });
});
