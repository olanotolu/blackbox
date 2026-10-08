"use client";

import { useMemo, useState } from "react";
import { PRODUCTS, PRODUCT_VERSIONS } from "blackbox-fixtures";
import type { FaultType } from "blackbox-engine";
import { bundlesForProduct, currentBundle, getBundles } from "../lib/bundles";
import { Disclaimer, Header, type TabId } from "../components/chrome";
import { Explorer } from "../components/Explorer";
import { TimeMachine } from "../components/TimeMachine";
import { FaultLab } from "../components/FaultLab";
import { ExpiryBoard } from "../components/ExpiryBoard";
import { EvidencePanel } from "../components/EvidencePanel";

export default function Page() {
  // Warm the bundle cache on first render (throws loudly if a fixture fails).
  useMemo(() => getBundles(), []);

  const [facilityId, setFacilityId] = useState("fac-harborview");
  const [productId, setProductId] = useState("prod-cx30");
  const [tab, setTab] = useState<TabId>("explorer");
  const [bundleKey, setBundleKey] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [explainPulse, setExplainPulse] = useState(0);
  const [faultType, setFaultType] = useState<FaultType | null>(null);
  const [timeBefore, setTimeBefore] = useState<string | null>(null);
  const [timeAfter, setTimeAfter] = useState<string | null>(null);

  const bundles = useMemo(() => bundlesForProduct(productId), [productId]);
  const current = useMemo(
    () => currentBundle(productId, PRODUCT_VERSIONS[productId]?.currentVersion ?? "v1"),
    [productId],
  );
  const bundle = useMemo(
    () => bundles.find((b) => b.key === bundleKey) ?? current,
    [bundles, bundleKey, current],
  );

  const resetForProduct = (pid: string) => {
    setProductId(pid);
    setBundleKey(null);
    setSelectedNodeId(null);
    setFaultType(null);
    setTimeBefore(null);
    setTimeAfter(null);
  };

  const pickFacility = (id: string) => {
    setFacilityId(id);
    resetForProduct(PRODUCTS.find((x) => x.facilityId === id)!.id);
  };

  const explain = () => {
    setTab("explorer");
    setSelectedNodeId(bundle.trace.resultNodeId);
    setExplainPulse(Date.now());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="bb-shell">
      <Header
        facilityId={facilityId}
        productId={productId}
        bundle={bundle}
        tab={tab}
        onTab={setTab}
        onFacility={pickFacility}
        onProduct={resetForProduct}
        onExplain={explain}
        explainPulse={explainPulse}
        faultActive={faultType !== null}
      />

      {tab === "explorer" && (
        <Explorer
          bundle={bundle}
          bundles={bundles}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onBundle={(key) => {
            setBundleKey(key);
            setSelectedNodeId(null);
          }}
        />
      )}

      {tab === "time" && bundles.length > 1 && (
        <TimeMachine
          bundles={bundles}
          beforeKey={timeBefore ?? bundles[0].key}
          afterKey={timeAfter ?? current.key}
          onBefore={setTimeBefore}
          onAfter={setTimeAfter}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
      )}
      {tab === "time" && bundles.length <= 1 && (
        <div className="panel">
          <div className="panel-bd note" style={{ padding: 32, textAlign: "center" }}>
            This product has a single snapshot — select the CX-30 product to use the time machine.
          </div>
        </div>
      )}

      {tab === "fault" && (
        <FaultLab bundle={current} activeType={faultType} onInject={setFaultType} />
      )}

      {tab === "expiry" && <ExpiryBoard />}

      {tab === "evidence" && (
        <EvidencePanel bundles={bundles} activeKey={bundle.key} onBundle={setBundleKey} />
      )}

      <Disclaimer />
      <div className="note" style={{ marginTop: 12, textAlign: "center" }}>
        BLACKBOX · the flight recorder for physical manufacturing · demo clock 2026-10-07 ·
        arithmetic: simplified illustrative model, not ISO LCA
      </div>
    </div>
  );
}
