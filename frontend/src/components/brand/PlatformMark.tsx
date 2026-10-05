import { useId } from 'react';
import type { SocialPlatform } from '@/lib/api';

function Note({ fill, dx, dy }: { fill: string; dx: number; dy: number }) {
  return (
    <g fill={fill} transform={`translate(${dx} ${dy})`}>
      <ellipse cx="18.2" cy="33.2" rx="6.2" ry="4.4" />
      <rect x="22.6" y="12.2" width="3.3" height="21.2" rx="1.2" />
      <path d="M25.8 12.4c3.4 2.4 6.6 3 9.2 2.6v3.5c-2.8.3-5.8-.4-8.8-2.4v-3.7z" />
    </g>
  );
}

export function PlatformMark({
  platform,
  size = 40,
}: {
  platform: SocialPlatform;
  size?: number;
}) {
  const id = useId().replace(/:/g, '');

  if (platform === 'instagram') {
    return (
      <svg className="platform-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="48" x2="48" y2="0">
            <stop offset="0" stopColor="#feda75" />
            <stop offset="0.25" stopColor="#fa7e1e" />
            <stop offset="0.5" stopColor="#d62976" />
            <stop offset="0.75" stopColor="#962fbf" />
            <stop offset="1" stopColor="#4f5bd5" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill={`url(#${id})`} />
        <rect x="13" y="13" width="22" height="22" rx="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="24" cy="24" r="5.2" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="31.4" cy="16.6" r="1.5" fill="#fff" />
      </svg>
    );
  }

  return (
    <svg className="platform-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="12" fill="#111111" />
      <Note fill="#25F4EE" dx={-1.5} dy={1.3} />
      <Note fill="#FE2C55" dx={1.5} dy={-1.1} />
      <Note fill="#ffffff" dx={0} dy={0} />
    </svg>
  );
}
