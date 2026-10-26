import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sân Cầu Pledge",
  description: "Vote ngày, giữ sân và thanh toán suất cầu lông Chủ nhật.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className="antialiased">{children}</body></html>;
}
