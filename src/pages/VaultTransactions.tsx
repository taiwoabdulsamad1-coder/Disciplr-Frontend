import { useState, useMemo, useCallback, useEffect, memo } from "react";
import { useParams } from "react-router-dom";
import { windowRange } from "../utils/windowRange";
import { toCsv, downloadCsv } from "../utils/csv";
import { computeTxTotals } from "../utils/txTotals";
import { AddressDisplay } from "../components/AddressDisplay";
import { truncateMiddle } from "../utils/truncate";
import { Tooltip } from "../components/Tooltip";
import Breadcrumb from "../components/Breadcrumb";
import { MASTER_VAULTS } from "../fixtures/vaults";
import {
  getCachedActivity,
  type VaultActivityRecord,
} from "../services/vaultService";
import { formatRelativeTime } from "../utils/relativeTime";
import {
  sortTransactions,
  type TransactionSortDir,
  type TransactionSortKey,
} from "../utils/sortTransactions";
import type { TxType, TxStatus } from "../types/vault";

// ── Types ─────────────────────────────────────────────────────────────────────
export type Transaction = VaultActivityRecord;

interface TypeMeta {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.FC<IconProps>;
}

interface StatusMeta {
  label: string;
  color: string;
  bg: string;
  dot: string;
}

interface IconProps {
  color?: string;
  size?: number;
}

// ── Mock Data moved to vaultService.ts ────────────────────────────────────────────────
// MOCK_TRANSACTIONS removed — listAllActivity() in vaultService is the source.

const TYPE_META: Record<TxType, TypeMeta> = {
  create: {
    label: "Create",
    color: "#6ee7b7",
    bg: "rgba(110,231,183,0.1)",
    border: "rgba(110,231,183,0.25)",
    icon: CreateIcon,
  },
  validate: {
    label: "Validate",
    color: "#93c5fd",
    bg: "rgba(147,197,253,0.1)",
    border: "rgba(147,197,253,0.25)",
    icon: ValidateIcon,
  },
  release: {
    label: "Release",
    color: "#fcd34d",
    bg: "rgba(252,211,77,0.1)",
    border: "rgba(252,211,77,0.25)",
    icon: ReleaseIcon,
  },
  redirect: {
    label: "Redirect",
    color: "#f9a8d4",
    bg: "rgba(249,168,212,0.1)",
    border: "rgba(249,168,212,0.25)",
    icon: RedirectIcon,
  },
};

const TX_TYPES: TxType[] = ["create", "validate", "release", "redirect"];
const ALL_TYPES: TxType[] = [...TX_TYPES];

const STATUS_META: Record<TxStatus, StatusMeta> = {
  confirmed: {
    label: "Confirmed",
    color: "#6ee7b7",
    bg: "rgba(110,231,183,0.08)",
    dot: "#6ee7b7",
  },
  pending: {
    label: "Pending",
    color: "#fcd34d",
    bg: "rgba(252,211,77,0.08)",
    dot: "#fcd34d",
  },
  failed: {
    label: "Failed",
    color: "#fca5a5",
    bg: "rgba(252,165,165,0.08)",
    dot: "#fca5a5",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Invariant: any Transaction surfaced to the UI must have a valid Date
 * timestamp, finite amount/fee, and non-empty hash. Records that violate
 * this are dropped and logged (without leaking sensitive fields) so that
 * downstream formatters, sorters, and totals cannot throw or silently
 * produce NaN/Invalid Date.
 */
function isValidTransaction(tx: unknown): tx is Transaction {
  if (!tx || typeof tx !== "object") return false;
  const t = tx as Partial<Transaction>;
  if (typeof t.id !== "string" || t.id.length === 0) return false;
  if (typeof t.hash !== "string" || t.hash.length === 0) return false;
  if (typeof t.type !== "string" || !(t.type in TYPE_META)) return false;
  if (typeof t.status !== "string" || !(t.status in STATUS_META)) return false;
  if (typeof t.amount !== "number" || !Number.isFinite(t.amount)) return false;
  if (typeof t.fee !== "number" || !Number.isFinite(t.fee)) return false;
  if (!(t.timestamp instanceof Date) || Number.isNaN(t.timestamp.getTime()))
    return false;
  return true;
}

/**
 * Parse a user-entered amount filter. Returns `undefined` for empty input,
 * `null` for invalid input (so callers can distinguish "no filter" from
 * "rejected"), and a finite number otherwise. Rejects partial parses like
 * "1abc", NaN, Infinity, and negative values.
 */
function parseAmountFilter(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  // Reject anything that isn't a clean decimal number.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Safe clipboard write. `navigator.clipboard.writeText` can throw
 * synchronously in insecure contexts and its promise can reject; both are
 * swallowed here so a copy failure never breaks the surrounding UI.
 */
function safeCopyToClipboard(text: string): void {
  try {
    const result = navigator?.clipboard?.writeText?.(text);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // Clipboard unavailable (insecure context, permissions, SSR). Non-fatal.
  }
}

function fmtTime(date: Date): string {
  return formatRelativeTime(date);
}

function fmtFullTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtAmount(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface VaultTransactionsProps {
  transactions?: Transaction[];
}

// ── Main Component ─────────────────────────────────────────────────────────────────
interface SortState {
  key: TransactionSortKey;
  dir: TransactionSortDir;
}

const DEFAULT_SORT: SortState = { key: "timestamp", dir: "desc" };

export default function VaultTransactions({
  transactions: providedTransactions,
}: VaultTransactionsProps = {}) {
  const { id } = useParams<{ id?: string }>();
  const routeVault = id ? MASTER_VAULTS[id] : undefined;
  const routeVaultName = routeVault?.name ?? (id ? `Vault ${id}` : undefined);
  const [selectedTypes, setSelectedTypes] = useState<TxType[]>([...ALL_TYPES]);
  const [filterVault, setFilterVault] = useState<string>("All Vaults");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchHash, setSearchHash] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [pendingAnchor, setPendingAnchor] = useState(0);
  const [failedAnchor, setFailedAnchor] = useState(0);
  const [restAnchor, setRestAnchor] = useState(0);

  // Prefer route-provided transactions; otherwise use the cached activity list.
  const transactions = useMemo(
    () => providedTransactions ?? getCachedActivity(),
    [providedTransactions],
  );

  const vaultOptions = useMemo(
    () => [
      "All Vaults",
      ...Array.from(new Set(transactions.map((tx) => tx.vault))).sort(),
    ],
    [transactions],
  );

  const breadcrumbSegments = routeVaultName
    ? [
        { label: "Home", to: "/" },
        { label: "Vaults", to: "/vaults" },
        { label: routeVaultName, to: `/vaults/${id}` },
        { label: "Transactions" },
      ]
    : [{ label: "Home", to: "/" }, { label: "Transactions" }];

  const copy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }, []);

  const updateSort = useCallback((key: TransactionSortKey) => {
    setSortState((current) => ({
      key,
      dir:
        current.key === key ? (current.dir === "desc" ? "asc" : "desc") : "asc",
    }));
    setPendingAnchor(0);
    setFailedAnchor(0);
    setRestAnchor(0);
  }, []);

  const filtered = useMemo<Transaction[]>(() => {
    let list = [...transactions];
    if (selectedTypes.length < ALL_TYPES.length)
      list = list.filter((t) => selectedTypes.includes(t.type));
    if (filterVault !== "All Vaults")
      list = list.filter((t) => t.vault === filterVault);
    if (filterStatus !== "all")
      list = list.filter((t) => t.status === filterStatus);
    if (searchHash.trim())
      list = list.filter((t) =>
        t.hash.toLowerCase().includes(searchHash.toLowerCase()),
      );
    if (amountMin !== "") {
      const min = parseFloat(amountMin);
      if (Number.isFinite(min)) {
        list = list.filter((t) => t.amount >= min);
      }
    }
    if (amountMax !== "") {
      const max = parseFloat(amountMax);
      if (Number.isFinite(max)) {
        list = list.filter((t) => t.amount <= max);
      }
    }
    return sortTransactions(list, sortState.key, sortState.dir);
  }, [
    selectedTypes,
    filterVault,
    filterStatus,
    searchHash,
    amountMin,
    amountMax,
    sortState,
    transactions,
  ]);

  const pending = useMemo(
    () => filtered.filter((t) => t.status === "pending"),
    [filtered],
  );
  const failed = useMemo(
    () => filtered.filter((t) => t.status === "failed"),
    [filtered],
  );
  const rest = useMemo(
    () => filtered.filter((t) => t.status === "confirmed"),
    [filtered],
  );

  // Reset window anchor when filters change so the user always sees the top.
  // sort changes are handled inside updateSort(); this effect covers the six
  // filter controls that filtered() depends on.
  useEffect(() => {
    setPendingAnchor(0);
    setFailedAnchor(0);
    setRestAnchor(0);
  }, [
    selectedTypes,
    filterVault,
    filterStatus,
    searchHash,
    amountMin,
    amountMax,
  ]);

  // windowRange is applied per-section; each section independently does not
  // exceed WINDOW_THRESHOLD in typical use, but large "confirmed" lists will.
  const pendingWindow = useMemo(
    () => windowRange(pending, pendingAnchor),
    [pending, pendingAnchor],
  );
  const failedWindow = useMemo(
    () => windowRange(failed, failedAnchor),
    [failed, failedAnchor],
  );
  const restWindow = useMemo(
    () => windowRange(rest, restAnchor),
    [rest, restAnchor],
  );

  const stats = useMemo(
    () => ({
      total: transactions.length,
      fees: transactions.reduce((s, t) => s + t.fee, 0),
      capital: transactions.reduce((s, t) => s + t.amount, 0),
    }),
    [transactions],
  );

  // Live counts reflect the current filtered (visible) set
  const filteredTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tx of filtered) {
      counts[tx.type] = (counts[tx.type] || 0) + 1;
    }
    return counts;
  }, [filtered]);

  const filteredTotals = useMemo(() => computeTxTotals(filtered), [filtered]);

  const clearFilters = () => {
    setSelectedTypes([...ALL_TYPES]);
    setFilterVault("All Vaults");
    setFilterStatus("all");
    setSearchHash("");
    setAmountMin("");
    setAmountMax("");
    setPendingAnchor(0);
    setFailedAnchor(0);
    setRestAnchor(0);
  };

  const hasFilters =
    selectedTypes.length < ALL_TYPES.length ||
    filterVault !== "All Vaults" ||
    filterStatus !== "all" ||
    !!searchHash ||
    !!amountMin ||
    !!amountMax;

  return (
    <>
      <style>{CSS}</style>
      <div className="vt-root">
        <div className="vt-grid-bg" />
        <div className="vt-wrap">
          <Breadcrumb
            segments={breadcrumbSegments}
            style={{ marginBottom: "var(--spacing-5)" }}
          />

          {/* Header */}
          <header className="vt-header">
            <div>
              <div className="vt-eyebrow">
                <span className="vt-eyebrow-dot" />
                Vault Activity
              </div>
              <h1 className="vt-title">Transaction History</h1>
              <p className="vt-subtitle">
                Complete on-chain record of all vault operations
              </p>
            </div>
            <button
              className="vt-export-btn"
              onClick={() =>
                downloadCsv(
                  toCsv(filtered, "transactions"),
                  "vault-transactions.csv",
                )
              }
              disabled={filtered.length === 0}
            >
              <ExportIcon />
              Export CSV
            </button>
          </header>

          {/* Stats */}
          <div className="vt-stats">
            {[
              {
                label: "Total Transactions",
                value: stats.total,
                sub: `${filtered.length} matching`,
              },
              {
                label: "Total Fees Paid",
                value: `${stats.fees.toFixed(5)} XLM`,
                sub: "Network costs",
              },
              {
                label: "Capital Moved",
                value: `${fmtAmount(stats.capital)} XLM`,
                sub: "Across all vaults",
              },
            ].map((s, i) => (
              <div className="vt-stat-card" key={i}>
                <div className="vt-stat-label">{s.label}</div>
                <div className="vt-stat-value">{s.value}</div>
                <div className="vt-stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Type Filter Toolbar */}
          <div
            className="vt-type-toolbar"
            role="group"
            aria-label="Filter by transaction type"
          >
            <button
              className={`vt-type-chip ${selectedTypes.length === ALL_TYPES.length ? "vt-type-chip--active-all" : ""}`}
              onClick={() =>
                setSelectedTypes(
                  selectedTypes.length === ALL_TYPES.length
                    ? []
                    : [...ALL_TYPES],
                )
              }
              aria-pressed={selectedTypes.length === ALL_TYPES.length}
            >
              <span className="vt-type-chip-label">All</span>
              <span className="vt-type-chip-count">{filtered.length}</span>
            </button>
            {TX_TYPES.map((type) => {
              const meta = TYPE_META[type];
              const active = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  className={`vt-type-chip ${active ? "vt-type-chip--active" : ""}`}
                  style={
                    active
                      ? {
                          background: meta.bg,
                          borderColor: meta.border,
                          color: meta.color,
                        }
                      : undefined
                  }
                  onClick={() =>
                    setSelectedTypes((prev) =>
                      prev.includes(type)
                        ? prev.filter((t) => t !== type)
                        : [...prev, type],
                    )
                  }
                  aria-pressed={active}
                >
                  <meta.icon
                    size={13}
                    color={active ? meta.color : undefined}
                  />
                  <span className="vt-type-chip-label">{meta.label}</span>
                  <span className="vt-type-chip-count">
                    {filteredTypeCounts[type] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Visible Totals */}
          {filtered.length > 0 && (
            <div className="vt-totals-strip">
              <span className="vt-totals-item">
                {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
              </span>
              <span className="vt-totals-sep" aria-hidden="true" />
              <span className="vt-totals-item">
                Amount: {fmtAmount(filteredTotals.totalAmount)} XLM
              </span>
              <span className="vt-totals-sep" aria-hidden="true" />
              <span className="vt-totals-item">
                Fees: {filteredTotals.totalFees.toFixed(5)} XLM
              </span>
            </div>
          )}

          {/* Filters */}
          <div className="vt-filters">
            <div className="vt-search-wrap">
              <SearchIcon className="vt-search-icon" />
              <input
                className="vt-search"
                placeholder="Search by transaction hash…"
                value={searchHash}
                onChange={(e) => setSearchHash(e.target.value)}
              />
            </div>
            <div className="vt-filter-row">
              <Select
                value={filterVault}
                onChange={setFilterVault}
                options={vaultOptions}
              />
              <Select
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "confirmed", label: "Status: Confirmed" },
                  { value: "pending", label: "Status: Pending" },
                  { value: "failed", label: "Status: Failed" },
                ]}
              />
              <div className="vt-amount-range">
                <input
                  className="vt-amount-input"
                  placeholder="Min XLM"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  type="number"
                />
                <span className="vt-amount-sep">–</span>
                <input
                  className="vt-amount-input"
                  placeholder="Max XLM"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  type="number"
                />
              </div>
              <button
                className="vt-sort-btn"
                onClick={() => updateSort("timestamp")}
              >
                <SortIcon
                  dir={sortState.key === "timestamp" ? sortState.dir : "desc"}
                />
                {sortState.key === "timestamp" && sortState.dir === "asc"
                  ? "Oldest"
                  : "Newest"}
              </button>
              {hasFilters && (
                <button className="vt-clear-btn" onClick={clearFilters}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Pending */}
          {pending.length > 0 && (
            <Section
              title="Pending"
              accent="#fcd34d"
              count={pending.length}
              sortState={sortState}
              onSort={updateSort}
            >
              {pendingWindow.items.map((tx) => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  onSelect={setSelectedTx}
                  onCopy={copy}
                  copiedId={copiedId}
                />
              ))}
              {pendingWindow.windowed && (
                <WindowBanner
                  start={pendingWindow.startIndex}
                  end={pendingWindow.endIndex}
                  total={pending.length}
                  onPrev={() => setPendingAnchor((a) => Math.max(0, a - 10))}
                  onNext={() =>
                    setPendingAnchor((a) =>
                      Math.min(pending.length - 1, a + 10),
                    )
                  }
                />
              )}
            </Section>
          )}

          {/* Failed */}
          {failed.length > 0 && (
            <Section
              title="Failed"
              accent="#fca5a5"
              count={failed.length}
              sortState={sortState}
              onSort={updateSort}
            >
              {failedWindow.items.map((tx) => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  onSelect={setSelectedTx}
                  onCopy={copy}
                  copiedId={copiedId}
                >
                  <button className="vt-retry-btn">Retry →</button>
                </TxRow>
              ))}
              {failedWindow.windowed && (
                <WindowBanner
                  start={failedWindow.startIndex}
                  end={failedWindow.endIndex}
                  total={failed.length}
                  onPrev={() => setFailedAnchor((a) => Math.max(0, a - 10))}
                  onNext={() =>
                    setFailedAnchor((a) => Math.min(failed.length - 1, a + 10))
                  }
                />
              )}
            </Section>
          )}

          {/* Confirmed */}
          <Section
            title="Confirmed"
            accent="#6ee7b7"
            count={rest.length}
            sortState={sortState}
            onSort={updateSort}
          >
            {rest.length === 0 ? (
              <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
            ) : (
              <>
                {restWindow.items.map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    onSelect={setSelectedTx}
                    onCopy={copy}
                    copiedId={copiedId}
                  />
                ))}
                {restWindow.windowed && (
                  <WindowBanner
                    start={restWindow.startIndex}
                    end={restWindow.endIndex}
                    total={rest.length}
                    onPrev={() => setRestAnchor((a) => Math.max(0, a - 10))}
                    onNext={() =>
                      setRestAnchor((a) => Math.min(rest.length - 1, a + 10))
                    }
                  />
                )}
              </>
            )}
          </Section>
        </div>

        {selectedTx && (
          <TxModal
            tx={selectedTx}
            onClose={() => setSelectedTx(null)}
            onCopy={copy}
            copiedId={copiedId}
          />
        )}
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
interface SectionProps {
  title: string;
  accent: string;
  count: number;
  sortState: SortState;
  onSort: (key: TransactionSortKey) => void;
  children: React.ReactNode;
}

function ariaSortFor(
  sortState: SortState,
  key: TransactionSortKey,
): "ascending" | "descending" | "none" {
  if (sortState.key !== key) return "none";
  return sortState.dir === "asc" ? "ascending" : "descending";
}

function Section({
  title,
  accent,
  count,
  sortState,
  onSort,
  children,
}: SectionProps) {
  const hasRows = count > 0;
  return (
    <section className="vt-section">
      <div className="vt-section-header">
        <span
          className="vt-section-dot"
          style={{ background: accent }}
          aria-hidden="true"
        />
        <span className="vt-section-title">{title}</span>
        <span className="vt-section-count">{count}</span>
      </div>
      <div
        className="vt-tx-list"
        role={hasRows ? "table" : undefined}
        aria-label={hasRows ? `${title} transactions` : undefined}
      >
        {hasRows && (
          <div role="rowgroup">
            <div role="row" className="vt-tx-header-row">
              <SortableColumnHeader
                label="Transaction Type"
                sortKey="type"
                sortState={sortState}
                onSort={onSort}
              />
              <span role="columnheader" aria-sort="none">
                Vault &amp; Details
              </span>
              <SortableColumnHeader
                label="Amount"
                sortKey="amount"
                sortState={sortState}
                onSort={onSort}
              />
              <SortableColumnHeader
                label="Fee"
                sortKey="fee"
                sortState={sortState}
                onSort={onSort}
              />
              <span role="columnheader" aria-sort="none">
                Status
              </span>
              <SortableColumnHeader
                label="Timestamp"
                sortKey="timestamp"
                sortState={sortState}
                onSort={onSort}
              />
            </div>
          </div>
        )}
        <div role={hasRows ? "rowgroup" : undefined}>{children}</div>
      </div>
    </section>
  );
}

interface SortableColumnHeaderProps {
  label: string;
  sortKey: TransactionSortKey;
  sortState: SortState;
  onSort: (key: TransactionSortKey) => void;
}

function SortableColumnHeader({
  label,
  sortKey,
  sortState,
  onSort,
}: SortableColumnHeaderProps) {
  const active = sortState.key === sortKey;
  const nextDirection =
    active && sortState.dir === "desc"
      ? "ascending"
      : active
        ? "descending"
        : "ascending";

  return (
    <span role="columnheader" aria-sort={ariaSortFor(sortState, sortKey)}>
      <button
        type="button"
        className="vt-column-sort-btn"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label} ${nextDirection}`}
      >
        {label}
        <span aria-hidden="true" className="vt-column-sort-indicator">
          {active ? (sortState.dir === "asc" ? "ASC" : "DESC") : "SORT"}
        </span>
      </button>
    </span>
  );
}

interface TxRowProps {
  tx: Transaction;
  onSelect: (tx: Transaction) => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  children?: React.ReactNode;
}

const TxRow = memo(function TxRow({
  tx,
  onSelect,
  onCopy,
  copiedId,
  children,
}: TxRowProps) {
  const meta = TYPE_META[tx.type];
  const status = STATUS_META[tx.status];
  const Icon = meta.icon;

  return (
    <div className="vt-tx-row" role="row" onClick={() => onSelect(tx)}>
      <div
        role="cell"
        className="vt-tx-icon"
        style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
      >
        <Icon color={meta.color} />
      </div>

      <div role="cell" className="vt-tx-main">
        <div className="vt-tx-top">
          <span className="vt-tx-type" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="vt-tx-vault">{tx.vault}</span>
          {tx.memo && <span className="vt-tx-memo">"{tx.memo}"</span>}
        </div>
        <div className="vt-tx-bottom">
          <Tooltip content={tx.hash} position="top">
            <button
              className="vt-tx-hash"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(tx.hash, tx.id + "-hash");
              }}
            >
              {copiedId === tx.id + "-hash"
                ? "Copied!"
                : truncateMiddle(tx.hash, 8, 6)}
              <CopyIcon small />
            </button>
          </Tooltip>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="vt-tx-explorer"
            onClick={(e) => e.stopPropagation()}
          >
            Explorer ↗
          </a>
        </div>
      </div>

      <div role="cell" className="vt-tx-amount">
        {tx.amount > 0 && (
          <span className="vt-tx-amount-val">
            {fmtAmount(tx.amount)}
            <span className="vt-tx-xlm">XLM</span>
          </span>
        )}
        <span className="vt-tx-fee">Fee: {tx.fee.toFixed(5)}</span>
      </div>

      <div role="cell" className="vt-tx-right">
        <span
          className="vt-tx-status"
          style={{ color: status.color, background: status.bg }}
        >
          <span
            className="vt-status-dot"
            style={{ background: status.dot }}
            aria-hidden="true"
          />
          {status.label}
        </span>
        <span className="vt-tx-time">{fmtTime(tx.timestamp)}</span>
      </div>

      {children && <div role="cell">{children}</div>}
    </div>
  );
});

interface TxModalProps {
  tx: Transaction;
  onClose: () => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
}

function TxModal({ tx, onClose, onCopy, copiedId }: TxModalProps) {
  const [rawOpen, setRawOpen] = useState(false);
  const meta = TYPE_META[tx.type];
  const status = STATUS_META[tx.status];
  const Icon = meta.icon;

  const raw = JSON.stringify(
    {
      id: tx.id,
      type: tx.type,
      vault: tx.vault,
      amount: tx.amount,
      fee: tx.fee,
      block: tx.block,
      hash: tx.hash,
      status: tx.status,
      from: tx.from,
      to: tx.to,
      memo: tx.memo,
      timestamp: tx.timestamp.toISOString(),
    },
    null,
    2,
  );

  return (
    <div className="vt-modal-backdrop" onClick={onClose}>
      <div className="vt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="vt-modal-close" onClick={onClose}>
          ✕
        </button>

        <div className="vt-modal-header">
          <div
            className="vt-modal-icon"
            style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            <Icon color={meta.color} size={22} />
          </div>
          <div>
            <div className="vt-modal-type" style={{ color: meta.color }}>
              {meta.label} Transaction
            </div>
            <div className="vt-modal-vault">{tx.vault}</div>
          </div>
          <span
            className="vt-tx-status"
            style={{
              color: status.color,
              background: status.bg,
              marginLeft: "auto",
            }}
          >
            <span
              className="vt-status-dot"
              style={{ background: status.dot }}
            />
            {status.label}
          </span>
        </div>

        <div className="vt-modal-grid">
          <Field label="Full Hash">
            <div className="vt-modal-hash-row">
              <span className="vt-modal-hash">{tx.hash}</span>
              <button
                className="vt-copy-btn"
                onClick={() => onCopy(tx.hash, "modal-hash")}
              >
                {copiedId === "modal-hash" ? "✓" : <CopyIcon />}
              </button>
            </div>
          </Field>
          <Field label="From">
            <AddressDisplay address={tx.from} />
          </Field>
          <Field label="To">
            <AddressDisplay address={tx.to} />
          </Field>
          <div className="vt-modal-row2">
            <Field label="Amount">
              <span className="vt-modal-amount">
                {fmtAmount(tx.amount)}{" "}
                <span style={{ opacity: 0.5, fontSize: "0.85em" }}>XLM</span>
              </span>
            </Field>
            <Field label="Fee Paid">
              <span className="vt-modal-amount">
                {tx.fee.toFixed(5)}{" "}
                <span style={{ opacity: 0.5, fontSize: "0.85em" }}>XLM</span>
              </span>
            </Field>
            <Field label="Block">
              <span className="vt-mono">{tx.block.toLocaleString()}</span>
            </Field>
          </div>
          <Field label="Timestamp">
            <span className="vt-mono">{fmtFullTime(tx.timestamp)}</span>
          </Field>
          {tx.memo && (
            <Field label="Memo">
              <span>{tx.memo}</span>
            </Field>
          )}
        </div>

        <div className="vt-raw-section">
          <button
            className="vt-raw-toggle"
            onClick={() => setRawOpen((o) => !o)}
          >
            {rawOpen ? "▾" : "▸"} Raw Transaction Data
          </button>
          {rawOpen && <pre className="vt-raw-pre">{raw}</pre>}
        </div>

        <div className="vt-modal-footer">
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="vt-explorer-link"
          >
            View on Stellar Explorer ↗
          </a>
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="vt-field">
      <div className="vt-field-label">{label}</div>
      <div className="vt-field-value">{children}</div>
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[] | SelectOption[];
}

function Select({ value, onChange, options }: SelectProps) {
  const opts: SelectOption[] = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div className="vt-select-wrap">
      <select
        className="vt-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronIcon />
    </div>
  );
}

interface EmptyStateProps {
  hasFilters: boolean;
  onClear: () => void;
}

function EmptyState({ hasFilters, onClear }: EmptyStateProps) {
  return (
    <div className="vt-empty">
      <div className="vt-empty-icon">◎</div>
      <div className="vt-empty-title">
        {hasFilters ? "No matching transactions" : "No transactions yet"}
      </div>
      <div className="vt-empty-sub">
        {hasFilters
          ? "Try adjusting your filters."
          : "Vault activity will appear here."}
      </div>
      {hasFilters && (
        <button className="vt-clear-btn vt-clear-btn--lg" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

// ── WindowBanner ──────────────────────────────────────────────────────────────
interface WindowBannerProps {
  start: number;
  end: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

function WindowBanner({
  start,
  end,
  total,
  onPrev,
  onNext,
}: WindowBannerProps) {
  return (
    <div className="vt-window-banner">
      <span className="vt-window-info">
        Showing {start + 1}–{end} of {total}
      </span>
      <div className="vt-window-nav">
        <button
          className="vt-window-btn"
          onClick={onPrev}
          disabled={start === 0}
        >
          ← Prev
        </button>
        <button
          className="vt-window-btn"
          onClick={onNext}
          disabled={end >= total}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function CreateIcon({ color = "currentColor", size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v12M2 8h12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ValidateIcon({ color = "currentColor", size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8l3.5 3.5L13 4.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ReleaseIcon({ color = "currentColor", size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 3v7m-3-3l3 3 3-3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 13h10" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function RedirectIcon({ color = "currentColor", size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h10m-4-4l4 4-4 4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface CopyIconProps {
  small?: boolean;
}
function CopyIcon({ small }: CopyIconProps) {
  const s = small ? 11 : 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 16 16"
      fill="none"
      style={{ display: "inline", marginLeft: small ? 3 : 0, opacity: 0.6 }}
    >
      <rect
        x="5"
        y="5"
        width="9"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3 11V3a1 1 0 011-1h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ExportIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      style={{ marginRight: 6 }}
    >
      <path
        d="M8 2v8m-3-3l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 13h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function SortIcon({ dir }: { dir: TransactionSortDir }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      style={{ marginRight: 4, verticalAlign: "middle" }}
    >
      {dir === "asc" ? (
        <path
          d="M8 3v10M4 7l4-4 4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M8 13V3M4 9l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        pointerEvents: "none",
        opacity: 0.5,
      }}
    >
      <path
        d="M2 3.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
  .vt-root {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-sans);
    position: relative;
    overflow-x: hidden;
  }
  .vt-grid-bg {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      linear-gradient(var(--success-transparent) 1px, transparent 1px),
      linear-gradient(90deg, var(--success-transparent) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .vt-wrap {
    position: relative; z-index: 1;
    max-width: var(--container-wide); margin: 0 auto;
    padding: 48px 24px 80px;
  }
  .vt-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin-bottom: 40px; gap: 16px; flex-wrap: wrap;
  }
  .vt-eyebrow {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;
    color: var(--success); margin-bottom: 10px; font-weight: 600;
  }
  .vt-eyebrow-dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--success);
    box-shadow: 0 0 8px var(--success);
    animation: vt-pulse 2s infinite;
  }
  @keyframes vt-pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
  .vt-title {
    font-size: clamp(28px, 4vw, 44px); font-weight: 800;
    color: var(--text); letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 6px;
  }
  .vt-subtitle { font-size: 14px; color: var(--muted); margin: 0; }
  .vt-export-btn {
    display: flex; align-items: center;
    background: var(--success-transparent); border: 1px solid var(--success);
    color: var(--success); font-family: var(--font-sans); font-size: 13px; font-weight: 600;
    padding: 10px 18px; border-radius: var(--radius-md); cursor: pointer;
    transition: background var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1)), border-color var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-export-btn:hover:not(:disabled) { background: var(--success-transparent); border-color: var(--success); }
  .vt-export-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .vt-stats {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px;
  }
  .vt-stat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 20px 22px; transition: border-color var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-stat-card:hover { border-color: var(--success); }
  .vt-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); font-weight: 600; margin-bottom: 8px; }
  .vt-stat-value { font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .vt-stat-sub   { font-size: 12px; color: var(--muted); }
  .vt-type-toolbar {
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 16px;
  }
  .vt-type-chip {
    display: inline-flex; align-items: center; gap: 5px;
    background: var(--surface); border: 1px solid var(--border);
    color: var(--muted); font-family: var(--font-sans); font-size: 12px; font-weight: 600;
    padding: 6px 12px; border-radius: var(--radius-full); cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
    user-select: none;
  }
  .vt-type-chip:hover { color: var(--text); border-color: var(--text); }
  .vt-type-chip--active { color: var(--success); }
  .vt-type-chip--active-all {
    background: var(--success-transparent); border-color: var(--success);
    color: var(--success);
  }
  .vt-type-chip--active-all:hover { background: var(--success-transparent); }
  .vt-type-chip-label { line-height: 1; }
  .vt-type-chip-count {
    font-family: var(--font-family-mono); font-size: 11px;
    background: var(--surface-raised); border-radius: var(--radius-full);
    padding: 1px 6px; line-height: 1.4;
  }
  .vt-type-chip--active .vt-type-chip-count {
    background: var(--surface-raised);
  }
  .vt-type-chip--active-all .vt-type-chip-count {
    background: var(--success-transparent);
  }
  .vt-totals-strip {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    margin-bottom: 18px; padding: 10px 16px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .vt-totals-item {
    font-size: 12px; color: var(--muted); font-weight: 600;
    font-family: var(--font-family-mono);
  }
  .vt-totals-sep {
    width: 3px; height: 3px; border-radius: 50%;
    background: var(--border); flex-shrink: 0;
  }
  .vt-filters {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 16px 18px; margin-bottom: 32px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .vt-search-wrap { position: relative; }
  .vt-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); }
  .vt-search {
    width: 100%; background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--radius-md); color: var(--text); font-family: var(--font-family-mono);
    font-size: 13px; padding: 9px 12px 9px 34px; outline: none; box-sizing: border-box;
    transition: border-color var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-search::placeholder { color: var(--border); }
  .vt-search:focus { border-color: var(--success); }
  .vt-filter-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .vt-select-wrap { position: relative; }
  .vt-select {
    appearance: none;
    background: var(--surface-raised); border: 1px solid var(--border);
    color: var(--muted); font-family: var(--font-sans); font-size: 12px; font-weight: 600;
    padding: 8px 30px 8px 12px; border-radius: 7px; cursor: pointer; outline: none;
    transition: border-color var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-select:hover, .vt-select:focus { border-color: var(--success); color: var(--text); }
  .vt-amount-range { display: flex; align-items: center; gap: 6px; }
  .vt-amount-input {
    width: 90px; background: var(--surface-raised); border: 1px solid var(--border);
    color: var(--muted); font-family: var(--font-family-mono); font-size: 12px;
    padding: 8px 10px; border-radius: 7px; outline: none; transition: border-color var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-amount-input:focus { border-color: var(--success); }
  .vt-amount-input::placeholder { color: var(--border); }
  .vt-amount-sep { color: var(--border); font-size: 13px; }
  .vt-clear-btn {
    background: transparent; border: 1px solid var(--danger);
    color: var(--danger); font-family: var(--font-sans); font-size: 12px; font-weight: 600;
    padding: 8px 14px; border-radius: 7px; cursor: pointer; transition: all var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-clear-btn:hover { background: var(--danger-transparent); }
  .vt-clear-btn--lg { padding: 10px 20px; font-size: 13px; margin-top: 12px; }
  .vt-section { margin-bottom: 28px; }
  .vt-section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .vt-section-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .vt-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }
  .vt-section-count {
    font-size: 11px; background: var(--surface-raised); border-radius: var(--radius-full);
    padding: 2px 8px; color: var(--muted); font-family: var(--font-family-mono);
  }
  .vt-tx-list { display: flex; flex-direction: column; gap: 4px; }
  .vt-tx-header-row {
    display: grid; grid-template-columns: 120px minmax(160px, 1fr) 120px 90px 100px 110px;
    gap: 12px; align-items: center;
    padding: 0 16px 8px; color: var(--muted);
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    font-weight: 700;
  }
  .vt-column-sort-btn {
    display: inline-flex; align-items: center; gap: 4px;
    background: transparent; border: 0; padding: 0;
    color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit;
    cursor: pointer;
  }
  .vt-column-sort-btn:hover, .vt-column-sort-btn:focus-visible {
    color: var(--text); outline: none;
  }
  .vt-column-sort-indicator {
    color: var(--success); font-family: var(--font-family-mono); font-size: 9px;
  }
  .vt-tx-row {
    display: flex; align-items: center; gap: 14px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 16px; cursor: pointer;
    transition: background var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1)), border-color var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1)); min-height: 64px;
  }
  .vt-tx-row:hover { background: var(--surface-raised); border-color: var(--success); }
  .vt-tx-icon {
    width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-tx-main { flex: 1; min-width: 0; }
  .vt-tx-top { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap; }
  .vt-tx-type { font-size: 13px; font-weight: 700; }
  .vt-tx-vault { font-size: 12px; color: var(--muted); }
  .vt-tx-memo { font-size: 11px; color: var(--border); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
  .vt-tx-bottom { display: flex; align-items: center; gap: 10px; }
  .vt-tx-hash {
    font-family: var(--font-family-mono); font-size: 11px; color: var(--muted);
    background: none; border: none; cursor: pointer; padding: 0;
    display: flex; align-items: center; gap: 3px; transition: color var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-tx-hash:hover { color: var(--text); }
  .vt-tx-explorer { font-size: 11px; color: var(--border); text-decoration: none; transition: color var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1)); }
  .vt-tx-explorer:hover { color: var(--success); }
  .vt-tx-amount { text-align: right; flex-shrink: 0; }
  .vt-tx-amount-val { display: block; font-family: var(--font-family-mono); font-size: 14px; font-weight: 500; color: var(--text); }
  .vt-tx-xlm { font-size: 10px; color: var(--muted); margin-left: 4px; }
  .vt-tx-fee { display: block; font-family: var(--font-family-mono); font-size: 10px; color: var(--border); margin-top: 3px; }
  .vt-tx-right { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
  .vt-tx-status {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
    padding: 3px 9px; border-radius: var(--radius-full);
  }
  .vt-status-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
  .vt-tx-time { font-size: 11px; color: var(--border); }
  .vt-retry-btn {
    background: var(--danger-transparent); border: 1px solid var(--danger);
    color: var(--danger); font-family: var(--font-sans); font-size: 11px; font-weight: 700;
    padding: 5px 10px; border-radius: 6px; cursor: pointer; flex-shrink: 0; transition: all var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-retry-btn:hover { background: var(--danger-transparent); }
  .vt-empty { text-align: center; padding: 56px 24px; }
  .vt-empty-icon { font-size: 36px; margin-bottom: 14px; opacity: 0.2; }
  .vt-empty-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
  .vt-empty-sub { font-size: 13px; color: var(--muted); }
  .vt-modal-backdrop {
    position: fixed; inset: 0; z-index: var(--z-index-modal);
    background: var(--overlay-backdrop); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center; padding: 24px;
    animation: vt-fadeIn var(--duration-normal, 200ms) var(--ease-out, cubic-bezier(0, 0, 0.2, 1));
  }
  @keyframes vt-fadeIn { from { opacity: 0 } to { opacity: 1 } }
  .vt-modal {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-xl); padding: 28px; width: 100%; max-width: 580px;
    max-height: 90vh; overflow-y: auto; position: relative;
    animation: vt-slideUp var(--duration-normal, 200ms) var(--ease-out, cubic-bezier(0, 0, 0.2, 1));
  }
  @keyframes vt-slideUp { from { transform: translateY(16px); opacity:0 } to { transform: translateY(0); opacity:1 } }
  .vt-modal-close {
    position: absolute; top: 18px; right: 18px;
    background: var(--surface-raised); border: 1px solid var(--border);
    color: var(--muted); font-size: 13px; width: 28px; height: 28px; border-radius: 6px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-modal-close:hover { color: var(--text); background: var(--hover); }
  .vt-modal-header { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
  .vt-modal-icon { width: 44px; height: 44px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .vt-modal-type { font-size: 16px; font-weight: 800; margin-bottom: 3px; }
  .vt-modal-vault { font-size: 13px; color: var(--muted); }
  .vt-modal-grid { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
  .vt-modal-row2 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .vt-field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--border); font-weight: 700; margin-bottom: 5px; }
  .vt-field-value { font-size: 13px; color: var(--text); word-break: break-all; }
  .vt-modal-hash-row { display: flex; align-items: center; gap: 8px; }
  .vt-modal-hash { font-family: var(--font-family-mono); font-size: 11px; color: var(--muted); word-break: break-all; }
  .vt-mono { font-family: var(--font-family-mono); font-size: 12px; }
  .vt-modal-amount { font-family: var(--font-family-mono); font-size: 15px; font-weight: 600; color: var(--text); }
  .vt-copy-btn {
    background: var(--surface-raised); border: 1px solid var(--border);
    color: var(--muted); padding: 4px 8px; border-radius: 5px; cursor: pointer;
    flex-shrink: 0; font-size: 12px; transition: all var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-copy-btn:hover { color: var(--text); background: var(--hover); }
  .vt-raw-section { margin-bottom: 20px; }
  .vt-raw-toggle {
    background: none; border: none; color: var(--muted); font-family: var(--font-sans);
    font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; transition: color var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-raw-toggle:hover { color: var(--text); }
  .vt-raw-pre {
    font-family: var(--font-family-mono); font-size: 11px; color: var(--muted);
    background: var(--overlay-backdrop); border: 1px solid var(--border);
    border-radius: var(--radius-md); padding: 14px; margin-top: 10px; overflow-x: auto; white-space: pre;
  }
  .vt-modal-footer { border-top: 1px solid var(--border); padding-top: 16px; }
  .vt-explorer-link {
    font-size: 13px; color: var(--success); text-decoration: none; font-weight: 600; transition: opacity var(--duration-fast, 150ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-explorer-link:hover { opacity: 0.75; }

  .vt-window-banner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; margin-top: 8px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-md); gap: 12px; flex-wrap: wrap;
  }
  .vt-window-info { font-size: 12px; color: var(--muted); font-weight: 600; }
  .vt-window-nav { display: flex; gap: 8px; }
  .vt-window-btn {
    background: var(--success-transparent); border: 1px solid var(--success);
    color: var(--success); font-family: var(--font-sans); font-size: 11px; font-weight: 700;
    padding: 5px 12px; border-radius: 6px; cursor: pointer;
    transition: all var(--duration-normal, 200ms) var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  .vt-window-btn:hover:not(:disabled) { background: var(--success-transparent); }
  .vt-window-btn:disabled { opacity: 0.3; cursor: default; }

  @media (max-width: 680px) {
    .vt-wrap { padding: 28px 16px 60px; }
    .vt-stats { grid-template-columns: 1fr 1fr; }
    .vt-stats > :last-child { grid-column: span 2; }
    .vt-tx-header-row { display: none; }
    .vt-tx-memo { display: none; }
    .vt-tx-amount { display: none; }
    .vt-modal-row2 { grid-template-columns: 1fr 1fr; }
    .vt-filter-row { gap: 8px; }
    .vt-amount-range { display: none; }
  }
  @media (max-width: 480px) {
    .vt-stats { grid-template-columns: 1fr; }
    .vt-stats > :last-child { grid-column: span 1; }
    .vt-header { flex-direction: column; align-items: flex-start; }
    .vt-modal-row2 { grid-template-columns: 1fr; }
  }
`;
