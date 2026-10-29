import "./globals.css";

export const metadata = {
  title: "SabbyBestCollection — Style and home, considered",
  description: "A thoughtful collection of fashion, home, and everyday essentials from SabbyBestCollection.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
