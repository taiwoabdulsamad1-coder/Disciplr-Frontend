import { ACCOUNT_A, ACCOUNT_B } from '@/__tests__/fixtures/stellarAddresses';
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreateVault from "../CreateVault";

vi.mock("../../context/WalletContext", () => ({
  useWallet: vi.fn(() => ({ balance: null, balanceStatus: "idle" })),
}));

vi.mock("../../services/vaultService", () => ({
  createVault: vi.fn(async (vault) => ({
    id: "999",
    name: vault.name,
    amount: vault.amount,
    currency: vault.currency,
    deadline: vault.deadline,
    creatorAddress: vault.creatorAddress,
    successAddress: vault.successAddress,
    failureAddress: vault.failureAddress,
    milestones: [],
    transactions: [],
  })),
}));

import { useWallet } from "../../context/WalletContext";
import { createVault } from "../../services/vaultService";
const mockUseWallet = vi.mocked(useWallet);

const successAddress = ACCOUNT_A;
const failureAddress = ACCOUNT_B;

function fillField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillFirstMilestone(
  title = "Design approved",
  criteria = "Verifier signs off",
) {
  fillField(/milestone 1 title/i, title);
  fillField(/milestone 1 criteria/i, criteria);
}

function renderCreateVault(state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/vaults/create",
          state,
        },
      ]}
    >
      <Routes>
        <Route path="/vaults/create" element={<CreateVault />} />
        <Route path="/vaults/:id" element={<div>Vault Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CreateVault", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockUseWallet.mockReturnValue({
      balance: null,
      balanceStatus: "idle",
    } as ReturnType<typeof useWallet>);
  });

  it("renders accessible inline errors and blocks invalid submissions", () => {
    const consoleDebug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    renderCreateVault();

    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please fix the highlighted fields before creating the vault.",
    );
    expect(
      screen.getAllByText(
        "Enter a positive USDC amount with up to 7 decimal places.",
      ),
    ).toHaveLength(2);
    expect(screen.getAllByText("Choose a future deadline.")).toHaveLength(2);
    expect(
      screen.getAllByText("Enter a valid Stellar public key starting with G or C."),
    ).toHaveLength(4);

    const amount = screen.getByLabelText(/amount/i);
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount).toHaveAttribute(
      "aria-describedby",
      "create-vault-amount-error",
    );
    expect(amount).toHaveFocus();

    const deadline = screen.getByLabelText(/deadline/i);
    expect(deadline).toHaveAttribute(
      "aria-describedby",
      "create-vault-deadline-error",
    );

    const success = screen.getByLabelText(/success destination/i);
    expect(success).toHaveAttribute(
      "aria-describedby",
      "create-vault-success-address-error",
    );

    const failure = screen.getByLabelText(/failure destination/i);
    expect(failure).toHaveAttribute(
      "aria-describedby",
      "create-vault-failure-address-error",
    );
    expect(consoleDebug).not.toHaveBeenCalled();
  });

  it("rejects identical destination addresses", () => {
    renderCreateVault();

    fillField(/amount/i, "100");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, successAddress);
    fillFirstMilestone();
    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

    expect(
      screen.getAllByText(
        "Failure destination must be different from success destination.",
      ),
    ).toHaveLength(2);
    expect(screen.getByLabelText(/failure destination/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows the review step for valid values and confirms once", () => {
    const consoleDebug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    renderCreateVault();

    fillField(/amount/i, "100.1234567");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone("Prototype", "Prototype approved by verifier");
    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

    expect(
      screen.getByRole("heading", { name: /review vault details/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Enter a positive USDC amount/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Prototype")).toBeInTheDocument();
    expect(
      screen.getByText("Prototype approved by verifier"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

    expect(consoleDebug).toHaveBeenCalledWith("CreateVault confirm", {
      amount: "100.1234567",
      deadline: "2030-01-01T00:00",
      successAddress,
      failureAddress,
      milestones: [
        {
          title: "Prototype",
          criteria: "Prototype approved by verifier",
        },
      ],
      evidenceUrl: undefined,
    });
    expect(consoleDebug).toHaveBeenCalledTimes(1);
  });

  it("returns to edit mode without losing entered values", () => {
    renderCreateVault();

    fillField(/amount/i, "55");
    fillField(/deadline/i, "2030-02-02T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone("Launch", "Launch evidence uploaded");
    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

    fireEvent.click(screen.getByRole("button", { name: /back to edit/i }));

    expect(screen.getByLabelText(/amount/i)).toHaveValue("55");
    expect(screen.getByLabelText(/deadline/i)).toHaveValue("2030-02-02T00:00");
    expect(screen.getByLabelText(/success destination/i)).toHaveValue(
      successAddress,
    );
    expect(screen.getByLabelText(/failure destination/i)).toHaveValue(
      failureAddress,
    );
    expect(screen.getByLabelText(/milestone 1 title/i)).toHaveValue("Launch");
    expect(screen.getByLabelText(/milestone 1 criteria/i)).toHaveValue(
      "Launch evidence uploaded",
    );
  });

  it("formats amount with thousands grouping while typing", () => {
    renderCreateVault();
    const input = screen.getByLabelText(/amount/i);

    fireEvent.change(input, { target: { value: "1234" } });
    expect(input).toHaveValue("1,234");

    fireEvent.change(input, { target: { value: "12345" } });
    expect(input).toHaveValue("12,345");

    fireEvent.change(input, { target: { value: "1234567" } });
    expect(input).toHaveValue("1,234,567");
  });

  it("caps decimal places at 7 while typing", () => {
    renderCreateVault();
    const input = screen.getByLabelText(/amount/i);

    fireEvent.change(input, { target: { value: "1.123456789" } });
    expect(input).toHaveValue("1.1234567");
  });

  it("strips non-numeric paste content", () => {
    renderCreateVault();
    const input = screen.getByLabelText(/amount/i);

    fireEvent.change(input, { target: { value: "abc1.5def" } });
    expect(input).toHaveValue("1.5");
  });

  it("normalises leading zeros", () => {
    renderCreateVault();
    const input = screen.getByLabelText(/amount/i);

    fireEvent.change(input, { target: { value: "001" } });
    expect(input).toHaveValue("1");
  });

  it("handles empty input gracefully", () => {
    renderCreateVault();
    const input = screen.getByLabelText(/amount/i);

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
  });

  it("keeps underlying raw value compatible with isValidUsdcAmount", () => {
    const consoleDebug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    renderCreateVault();

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "1234.5678" },
    });
    fireEvent.change(screen.getByLabelText(/deadline/i), {
      target: { value: "2030-01-01T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/success destination/i), {
      target: { value: successAddress },
    });
    fireEvent.change(screen.getByLabelText(/failure destination/i), {
      target: { value: failureAddress },
    });
    fillFirstMilestone();

    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

    expect(consoleDebug).toHaveBeenCalledWith(
      "CreateVault confirm",
      expect.objectContaining({ amount: "1234.5678" }),
    );
  });

  it("shows insufficient balance warning when amount exceeds balance", () => {
    mockUseWallet.mockReturnValue({
      balance: "50",
      balanceStatus: "success",
    } as ReturnType<typeof useWallet>);
    renderCreateVault();

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "100" },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      /exceeds your available usdc balance/i,
    );
  });

  it("does not show warning when amount equals balance", () => {
    mockUseWallet.mockReturnValue({
      balance: "100",
      balanceStatus: "success",
    } as ReturnType<typeof useWallet>);
    renderCreateVault();

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "100" },
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("calls the createVault service and navigates to the detail page on confirm", async () => {
    mockUseWallet.mockReturnValue({
      balance: "5000",
      balanceStatus: "success",
      address: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
    } as ReturnType<typeof useWallet>);
    
    renderCreateVault();

    fillField(/amount/i, "100.5");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone("Milestone 1", "Default milestone criteria");

    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

    await screen.findByText("Vault Detail Page");

    expect(createVault).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100.5,
      successAddress,
      failureAddress,
      deadline: "2030-01-01T00:00",
    }));
  });

  it("prevents duplicate confirmation while vault creation is pending", async () => {
    mockUseWallet.mockReturnValue({
      balance: "5000",
      balanceStatus: "success",
      address: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
      network: "TESTNET",
    } as ReturnType<typeof useWallet>);

    let resolveCreation!: (value: { id: string }) => void;
    vi.mocked(createVault).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreation = resolve;
      }) as ReturnType<typeof createVault>,
    );

    renderCreateVault();
    fillField(/amount/i, "100");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone();

    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
    const confirmButton = screen.getByRole("button", { name: /confirm vault/i });
    fireEvent.click(confirmButton);

    expect(confirmButton).toBeDisabled();
    expect(createVault).toHaveBeenCalledTimes(1);

    fireEvent.click(confirmButton);
    expect(createVault).toHaveBeenCalledTimes(1);

    resolveCreation({ id: "pending-creation" });
    await screen.findByText("Vault Detail Page");
  });

  it("allows retrying after a failed creation attempt", async () => {
    mockUseWallet.mockReturnValue({
      balance: "5000",
      balanceStatus: "success",
      address: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
      network: "TESTNET",
    } as ReturnType<typeof useWallet>);

    vi.mocked(createVault)
      .mockRejectedValueOnce(new Error("temporary service failure"))
      .mockResolvedValueOnce({ id: "retry-success" } as any);

    renderCreateVault();
    fillField(/amount/i, "100");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone();

    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporary service failure",
    );
    expect(createVault).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));
    await screen.findByText("Vault Detail Page");

    expect(createVault).toHaveBeenCalledTimes(2);
  });

  it("shows error and prevents submit when wallet is disconnected on confirm", async () => {
    mockUseWallet.mockReturnValue({
      balance: null,
      balanceStatus: "idle",
      address: null,
      network: "TESTNET"
    } as ReturnType<typeof useWallet>);
    
    renderCreateVault();
    fillField(/amount/i, "100");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone();
    
    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));
    
    expect(await screen.findByRole("alert")).toHaveTextContent(/wallet disconnected/i);
    expect(createVault).not.toHaveBeenCalled();
  });

  it("shows error and prevents submit on wrong network", async () => {
    mockUseWallet.mockReturnValue({
      balance: "5000",
      balanceStatus: "success",
      address: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
      network: "PUBLIC" // assuming default TESTNET in test env
    } as ReturnType<typeof useWallet>);
    
    renderCreateVault();
    fillField(/amount/i, "100");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone();
    
    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));
    
    expect(await screen.findByRole("alert")).toHaveTextContent(/wrong network/i);
    expect(createVault).not.toHaveBeenCalled();
  });

  it("handles malformed response from server", async () => {
    mockUseWallet.mockReturnValue({
      balance: "5000",
      balanceStatus: "success",
      address: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
      network: "TESTNET"
    } as ReturnType<typeof useWallet>);
    
    vi.mocked(createVault).mockResolvedValueOnce({} as any);
    
    renderCreateVault();
    fillField(/amount/i, "100");
    fillField(/deadline/i, "2030-01-01T00:00");
    fillField(/success destination/i, successAddress);
    fillField(/failure destination/i, failureAddress);
    fillFirstMilestone();
    
    fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));
    
    expect(await screen.findByRole("alert")).toHaveTextContent(/malformed response/i);
  });
});
