// src/AppRouter.tsx
import React, { Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import BackgroundFX from "./components/BackgroundFX";
import Shell from "./components/Shell";

const Home     = React.lazy(() => import("./pages/_Home"));
const Explore  = React.lazy(() => import("./pages/Explore"));
const Mempool  = React.lazy(() => import("./pages/Mempool"));
const NodePage = React.lazy(() => import("./pages/Node"));
const Wallet   = React.lazy(() => import("./pages/Wallet"));
const IDE      = React.lazy(() => import("./pages/IDE"));
const ArkAI    = React.lazy(() => import("./pages/ArkAI"));
const DevHarness = React.lazy(() => import("./pages/DevHarness"));

function Fallback() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="glass px-5 py-3 text-sm text-muted rounded-md">Loading…</div>
    </div>
  );
}

import { ToasterProvider } from "./ui/Toaster";
import { ConfirmProvider } from "./ui/Confirm";
import { ThemeProvider } from "./theme";

export default function AppRouter() {
  return (
    <div className="relative h-full overflow-hidden">
      {/* ThemeProvider controls data-theme on <html> for light/dark */}
      <ThemeProvider>
        <BackgroundFX />
        <HashRouter>
          <ToasterProvider>
            <ConfirmProvider>
              <Suspense fallback={<Fallback />}>
                <Shell>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/wallet" element={<Wallet />} />
                    <Route path="/explore" element={<Explore />} />
                    <Route path="/mempool" element={<Mempool />} />
                    <Route path="/node" element={<NodePage />} />
                    <Route path="/arkai" element={<ArkAI />} />
                    <Route path="/ide" element={<IDE />} />
                    <Route path="/dev" element={<DevHarness />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Shell>
              </Suspense>
            </ConfirmProvider>
          </ToasterProvider>
        </HashRouter>
      </ThemeProvider>
    </div>
  );
}
