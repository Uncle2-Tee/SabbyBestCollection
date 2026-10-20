import "./globals.css";

export const metadata = {
  title: "SabbyBestCollection — Skincare, considered",
  description: "A thoughtful collection of high-performance beauty essentials from SabbyBestCollection.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
