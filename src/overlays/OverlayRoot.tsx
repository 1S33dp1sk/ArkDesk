// src/overlays/OverlayRoot.tsx
import React, { useState } from "react";
import { ToasterProvider, useToast } from "../ui/Toaster";
import { ConfirmProvider, useConfirm } from "../ui/Confirm";
import ProgressSheet from "../ui/ProgressSheet";
import CopyTooltip from "../ui/CopyTooltip";

function DemoRow() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | undefined>(undefined);

  const runProgress = async () => {
    setBusy(true); setPct(undefined);
    await new Promise(r => setTimeout(r, 600));
    setPct(0);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 120));
      setPct(i);
    }
    setBusy(false); setPct(undefined);
    toast({ variant: "success", title: "Done", message: "All steps completed." });
  };

  return (
    <div className="glass p-3 rounded-md flex items-center gap-2">
      <button className="btn btn-primary px-3 py-1.5" onClick={() => toast({ message: "Hello from toaster." })}>Toast</button>
      <button
        className="btn px-3 py-1.5"
        onClick={async () => {
          const ok = await confirm({ title: "Delete snapshot?", message: "You can’t undo this.", danger: true, confirmText: "Delete" });
          if (ok) toast({ variant: "danger", message: "Snapshot deleted." });
        }}
      >
        Confirm
      </button>
      <button className="btn px-3 py-1.5" onClick={runProgress}>Progress</button>
      <CopyTooltip value="fa8ece79e9…6fc">
        <button className="btn px-3 py-1.5">Copy tip</button>
      </CopyTooltip>

      <ProgressSheet
        open={busy}
        title="Sealing block…"
        subtitle={pct == null ? "Preparing" : `${pct}%`}
        progress={pct}
        details={pct == null ? "Warming up" : "Writing chunks"}
        onCancel={() => { setBusy(false); setPct(undefined); }}
      />
    </div>
  );
}

export default function OverlayRoot() {
  return (
    <ToasterProvider>
      <ConfirmProvider>
        <DemoRow />
      </ConfirmProvider>
    </ToasterProvider>
  );
}
