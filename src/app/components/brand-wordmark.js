import Image from "next/image";

export default function BrandWordmark({ className = "" }) {
  return (
    <span className={`brand-wordmark ${className}`.trim()}>
      <Image
        src="/virtuous-matess-ventures-logo.png"
        alt="Virtuous Matess Ventures"
        className="brand-wordmark-logo"
        width={860}
        height={420}
        unoptimized
        priority
      />
    </span>
  );
}
