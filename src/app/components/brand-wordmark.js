export default function BrandWordmark({ className = "" }) {
  return (
    <span className={`brand-wordmark ${className}`.trim()}>
      <span className="brand-wordmark-monogram" aria-hidden="true">VMV</span>
      <span className="brand-wordmark-copy">
        <span className="brand-wordmark-name">Virtuous Matess</span>
        <span className="brand-wordmark-subtitle">Ventures</span>
      </span>
    </span>
  );
}
