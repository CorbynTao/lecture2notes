import { Suspense } from "react";
import { Workbench } from "./workbench";
export function RouteShell() { return <Suspense fallback={<div className="page-loading">正在打开学习空间…</div>}><Workbench /></Suspense>; }
