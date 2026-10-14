"use client";
import { Fragment, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
function Formula({ text, block = false }: { text: string; block?: boolean }) {
  try {
    const html = katex.renderToString(text, { displayMode: block, throwOnError: true, trust: false, strict: "warn", maxExpand: 200, maxSize: 10 });
    return <span className={block ? "rendered-formula" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch { return <span className="formula-fallback">{text}<small>公式解析失败，请核对原始表达</small></span>; }
}
// Rendering as React text nodes deliberately excludes raw HTML and executable links.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\$[^$]+\$)/g).map((p, i) => p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p.startsWith("$") ? <Formula text={p.slice(1, -1)} key={i} /> : <Fragment key={i}>{p}</Fragment>);
}
export function Markdown({ text }: { text: string }) {
  const chunks = text.split(/(\$\$[\s\S]*?\$\$)/g);
  return <div className="prose">{chunks.map((chunk, n) => chunk.startsWith("$$") ? <div className="math-block" key={n}><Formula text={chunk.slice(2, -2)} block /></div> : <Fragment key={n}>{chunk.split(/\n\s*\n/).map((p, i) => {
    if (p.trim().startsWith("- ")) return <ul key={i}>{p.split("\n").map((l, j) => <li key={j}>{inline(l.replace(/^- /, ""))}</li>)}</ul>;
    if (p.startsWith("### ")) return <h4 key={i}>{inline(p.slice(4))}</h4>;
    if (p.startsWith("## ")) return <h3 key={i}>{inline(p.slice(3))}</h3>;
    return <p key={i}>{p.split("\n").map((line, j) => <Fragment key={j}>{j > 0 && <br />}{inline(line)}</Fragment>)}</p>;
  })}</Fragment>)}</div>;
}
