import type { Metadata } from "next";
import "./lecture.css";
import "./readability.css";

export const metadata: Metadata = {
  title: "Lecture2Notes · 让知识，有迹可循",
  description: "把课堂截图、课件和文字记录整理成有来源、可编辑、可导出的复习笔记。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
