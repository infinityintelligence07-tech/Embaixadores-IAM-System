interface SpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-10 border-[3px]',
};

export function Spinner({ label = 'Carregando', size = 'md' }: SpinnerProps) {
  return (
    <div role="status" className="inline-flex items-center gap-2 text-text-muted">
      <span
        aria-hidden
        className={`animate-spin rounded-full border-brand-gold border-r-transparent ${sizeMap[size]}`}
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
