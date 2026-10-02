export function BrandMark({ variant }: { variant: 'wordmark' | 'icon' }) {
  if (variant === 'wordmark') {
    return (
      <img
        className="brand-wordmark"
        src="/brand/wordmark-light.png"
        alt="Embaixadores Acorde Sua Mente"
      />
    );
  }

  return <img className="brand-icon" src="/brand/mark-black.jpg" alt="" />;
}
