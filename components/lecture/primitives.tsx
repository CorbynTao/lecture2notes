"use client";
import { type ReactNode, useEffect, useRef } from "react";
import { X, AlertCircle, Info, Check, FileText, ArrowUpRight } from "lucide-react";
export function Button({ children, className = "", variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Banner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" | "error" | "success" }) { const Icon = tone === "success" ? Check : tone === "info" ? Info : AlertCircle; return <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}><Icon size={17} /><div>{children}</div></div>; }
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("button,input,textarea,a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a,input,textarea,select,[tabindex="0"]') ?? []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey); return () => { document.removeEventListener("keydown", onKey); prior?.focus(); };
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" aria-label="关闭" onClick={close}><X size={20} /></button></div>{children}</div></div>;
}
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) { return <div className="empty"><div className="empty-icon"><FileText size={30} strokeWidth={1.4} /></div><h3>{title}</h3><p>{text}</p>{children}</div>; }
export function ModeCard({ mode, selected, onClick }: { mode: "faithful" | "enhanced"; selected: boolean; onClick: () => void }) {
  return <button className={`mode-card ${selected ? "selected" : ""}`} onClick={onClick} aria-pressed={selected}><div className="mode-top"><span className="mode-icon">{mode === "faithful" ? <FileText size={20} /> : <ArrowUpRight size={20} />}</span><span className="radio-dot">{selected && <span />}</span></div><h3>{mode === "faithful" ? "忠实整理" : "学习增强"}</h3><p>{mode === "faithful" ? "保留原意，梳理课堂内容" : "补充解释，让知识更好理解"}</p><span className="mode-tip">{mode === "faithful" ? "适合课后归档 · 不主动扩展" : "适合复习理解 · 补充单独标注"}</span></button>;
}
