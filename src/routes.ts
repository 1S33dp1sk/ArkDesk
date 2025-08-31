// src/routes.ts
export type RouteInfo = { path: string; title: string; showInMenu?: boolean };
export const ROUTES: RouteInfo[] = [
  { path: "/",        title: "Home",    showInMenu: true },
  { path: "/wallet",  title: "Wallet",  showInMenu: true },
  { path: "/explore", title: "Explore", showInMenu: true },
  { path: "/mempool", title: "Mempool", showInMenu: true },
  { path: "/node",    title: "Node",    showInMenu: true },
  { path: "/arkai", title: "ArkAI", showInMenu: true },
  { path: "/ide",     title: "IDE",     showInMenu: true },
];
export const pathTitle = (p: string) => ROUTES.find(r => r.path === p)?.title ?? "Arknet";
