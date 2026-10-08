"use client";

import { useMemo, useState } from "react";
import { AS_OF, EPD_RECORDS } from "blackbox-fixtures";
import type { EpdRecord } from "blackbox-engine";
import { downloadJson } from "../lib/format";
import { DRIFT_FLAGS, epdRisk, renewalScore, sortByRenewal, type EpdStatus } from "../lib/renewal";
import { Badge, SectionTitle } from "./chrome";

const STATUS_TONE: Record<EpdStatus, "red" | "amber" | "green"> = {
  expired: "red",
  expiring_soon: "amber",
  valid: "green",
};

const STATUS_LABEL: Record<EpdStatus, string> = {
  expired: "EXPIRED",
  expiring_soon: "EXPIRING SOON",
  valid: "VALID",
};

const EVIDENCE_TONE: Record<string, string> = {
  ok: "st-ok",
  missing: "st-missing",
  stale: "st-stale",
};

export function ExpiryBoard() {
  const nowIso = AS_OF;
  const sorted = useMemo(() => sortByRenewal(EPD_RECORDS, nowIso), [nowIso]);
  const [selectedId, setSelectedId] = useState<string>(sorted[0]?.id ?? "");
  const record: EpdRecord = sorted.find((r) => r.id === selectedId) ?? sorted[0];
  const risk = epdRisk(record, nowIso);
  const score = renewalScore(record, nowIso);
  const driftFlags = DRIFT_FLAGS[record.id] ?? [];

  const counts = useMemo(() => {
    const c = { expired: 0, expiring_soon: 0, valid: 0 };
    for (const r of EPD_RECORDS) c[epdRisk(r, nowIso).status]++;
    return c;
  }, [nowIso]);

  const actions = useMemo(() => {
    const list: { priority: number; action: string; owner: string }[] = [];
    let n = 1;
    for (const e of record.evidence) {
      if (e.status === "missing") {
        list.push({ priority: n++, action: `Collect: ${e.item}`, owner: "data_steward" });
      } else if (e.status === "stale") {
        list.push({ priority: n++, action: `Refresh: ${e.item}`, owner: "data_steward" });
      }
    }
    for (const flag of driftFlags) {
      list.push({ priority: n++, action: `Reconcile drift since issuance: ${flag}`, owner: "engineering" });
    }
    if (risk.status !== "valid") {
      list.push({ priority: n++, action: "Verification-liaison review of renewal scope before expiry", owner: "verification_liaison" });
    }
    list.push({ priority: n++, action: "Re-run BLACKBOX evaluation to confirm the renewal snapshot is reproducible", owner: "engineering" });
    return list;
  }, [record, risk, driftFlags]);

  const workPacket = {
    packetId: `renewal-${record.id}`,
    recordId: record.id,
    productId: record.productId,
    facilityId: record.facilityId,
    programOperator: record.programOperator,
    risk,
    renewalScore: score,
    evidence: record.evidence,
    driftFlags,
    actions,
    generatedAt: nowIso,
    reviewNote:
      "Renewal intelligence only. This packet prioritizes evidence-refresh work for human " +
      "reviewers. It does not renew the declaration, does not verify its contents, and makes " +
      "no claim about regulatory compliance. Expiry is a validity-window fact, not noncompliance.",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span className="note">STATUS</span>
        {(Object.keys(counts) as EpdStatus[]).map((s) => (
          <Badge key={s} tone={STATUS_TONE[s]}>
            {STATUS_LABEL[s]} · {counts[s]}
          </Badge>
        ))}
        <span className="note" style={{ marginLeft: "auto" }}>
          demo clock: <span className="mono">{nowIso}</span> · expiration risk only —
          no claim of renewal, verification, or compliance
        </span>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-hd">EPD REGISTER — SORTED BY RENEWAL PRIORITY</div>
          <table className="bb-table">
            <thead>
              <tr><th>RECORD</th><th>PRODUCT</th><th>EXPIRES</th><th>STATUS</th><th style={{ textAlign: "right" }}>PRIORITY</th></tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const rk = epdRisk(r, nowIso);
                const sc = renewalScore(r, nowIso);
                const ok = r.evidence.filter((e) => e.status === "ok").length;
                return (
                  <tr
                    key={r.id}
                    className={`clickable${r.id === record.id ? " selected" : ""}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="mono" style={{ fontSize: 12 }}>{r.id}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.productId}<div className="note">{ok}/{r.evidence.length} evidence ok</div></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.expiryDate}<div className="note">{rk.label}</div></td>
                    <td><Badge tone={STATUS_TONE[rk.status]}>{STATUS_LABEL[rk.status]}</Badge></td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 800, color: "var(--amber)", fontSize: 16 }}>
                      {sc.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="panel-bd note">
            Priority 0–100 = expiry (40/30/20) + evidence (10/missing, 5/stale, cap 35) + drift (8/flag, cap 25).
            Decomposed per record — never a single opaque number.
          </div>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-hd">
              <span className="mono">{record.id}</span>
              <Badge tone={STATUS_TONE[risk.status]}>{STATUS_LABEL[risk.status]}</Badge>
            </div>
            <div className="panel-bd">
              <dl className="kv">
                <dt>PRODUCT</dt><dd className="mono">{record.productId}</dd>
                <dt>ISSUED</dt><dd className="mono">{record.issueDate}</dd>
                <dt>EXPIRES</dt><dd className="mono">{record.expiryDate} <span className="note">({risk.label})</span></dd>
                <dt>OPERATOR</dt><dd className="mono">{record.programOperator}</dd>
                <dt>VERIFICATION</dt>
                <dd className="note">
                  {record.verification.status} (synthetic) — not third-party verified; this demo never asserts verification
                </dd>
              </dl>

              <SectionTitle>Renewal priority — decomposed</SectionTitle>
              <div className="num" style={{ fontSize: 30, fontWeight: 800, color: "var(--amber)" }}>
                {score.total}<span style={{ fontSize: 14, color: "var(--muted)" }}> / 100</span>
              </div>
              <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>
                expiry <b style={{ color: "var(--amber)" }}>{score.expiry}</b>
                {" · "}evidence <b style={{ color: "var(--amber)" }}>{score.evidence}</b>
                {" · "}drift <b style={{ color: "var(--amber)" }}>{score.drift}</b>
              </div>
              <ul className="narrative">
                {score.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>

              <SectionTitle>Evidence checklist</SectionTitle>
              {record.evidence.map((e, i) => (
                <div key={i} className="check-item">
                  <span className={`st ${EVIDENCE_TONE[e.status]}`}>{e.status.toUpperCase()}</span>
                  <div style={{ fontSize: 12.5 }}>{e.item}</div>
                </div>
              ))}

              {driftFlags.length > 0 && (
                <>
                  <SectionTitle>Drift since issuance</SectionTitle>
                  {driftFlags.map((f) => (
                    <div key={f} className="check-item">
                      <span className="st st-stale">DRIFT</span>
                      <div className="mono" style={{ fontSize: 12 }}>{f}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-hd">
              RENEWAL WORK PACKET
              <button className="btn btn-sm btn-ghost" onClick={() => downloadJson(`${workPacket.packetId}.json`, workPacket)}>
                ⤓ DOWNLOAD JSON
              </button>
            </div>
            <div className="panel-bd">
              <div className="note mono" style={{ marginBottom: 8 }}>{workPacket.packetId}</div>
              {actions.map((a) => (
                <div key={a.priority} className="check-item">
                  <span className="mono" style={{ color: "var(--amber)", fontWeight: 700 }}>P{a.priority}</span>
                  <div>
                    <div style={{ fontSize: 12.5 }}>{a.action}</div>
                    <div className="note">owner: <span className="mono">{a.owner}</span></div>
                  </div>
                </div>
              ))}
              <div className="disclaimer">{workPacket.reviewNote}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
