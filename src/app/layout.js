import "./globals.css";

export const metadata = {
  title: "Virtuous Matess Ventures | Style, home, and everyday essentials",
  description: "A thoughtful collection of fashion, home, and everyday essentials from Virtuous Matess Ventures.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
