import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  withGlow?: boolean;
}

const sizeMap = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
};

export const AppLogo: React.FC<AppLogoProps> = ({
  className = '',
  size = 'md',
  withGlow = true,
}) => {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${sizeMap[size]} ${className}`}>
      {withGlow && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500/30 to-yellow-300/20 blur-md opacity-75 group-hover:opacity-100 transition-opacity pointer-events-none" />
      )}
      <svg
        viewBox="0 0 512 512"
        className="w-full h-full relative z-10 drop-shadow-sm select-none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="appLogoBg" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stopColor="#2E1C07" />
            <stop offset="45%" stopColor="#1C1104" />
            <stop offset="78%" stopColor="#100A02" />
            <stop offset="100%" stopColor="#080501" />
          </radialGradient>
          <radialGradient id="appLogoAura" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.5" />
            <stop offset="35%" stopColor="#D97706" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#78350F" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="appLogoSpiral1" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#92400E" />
            <stop offset="35%" stopColor="#D97706" />
            <stop offset="70%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#FFFBEB" />
          </linearGradient>
          <linearGradient id="appLogoSpiral2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="70%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>
          <linearGradient id="appLogoFlower" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFBEB" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#FBBF24" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#B45309" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* Base Squircle */}
        <rect x="0" y="0" width="512" height="512" rx="118" fill="url(#appLogoBg)" />
        <rect x="8" y="8" width="496" height="496" rx="112" stroke="#F59E0B" strokeOpacity="0.25" strokeWidth="2" fill="none" />
        <circle cx="256" cy="256" r="210" fill="url(#appLogoAura)" />

        {/* Flor de la Vida */}
        <g stroke="url(#appLogoFlower)" strokeWidth="1.8" fill="none">
          <circle cx="256" cy="256" r="68" />
          <circle cx="324" cy="256" r="68" />
          <circle cx="290" cy="314.89" r="68" />
          <circle cx="222" cy="314.89" r="68" />
          <circle cx="188" cy="256" r="68" />
          <circle cx="222" cy="197.11" r="68" />
          <circle cx="290" cy="197.11" r="68" />
          <circle cx="256" cy="256" r="136" stroke="#FBBF24" strokeWidth="2" strokeOpacity="0.6" />
        </g>

        {/* Espiral Áurea */}
        <path
          d="M 256 256 A 13 13 0 0 1 243 269 A 21 21 0 0 1 222 248 A 34 34 0 0 1 256 214 A 55 55 0 0 1 311 269 A 89 89 0 0 1 222 358 A 144 144 0 0 1 78 214 A 233 233 0 0 1 311 -19"
          fill="none"
          stroke="url(#appLogoSpiral1)"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Contra-Espiral Áurea */}
        <g transform="rotate(180, 256, 256)">
          <path
            d="M 256 256 A 13 13 0 0 1 243 269 A 21 21 0 0 1 222 248 A 34 34 0 0 1 256 214 A 55 55 0 0 1 311 269 A 89 89 0 0 1 222 358 A 144 144 0 0 1 78 214 A 233 233 0 0 1 311 -19"
            fill="none"
            stroke="url(#appLogoSpiral2)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>

        {/* Estrella de 5 puntas */}
        <g transform="translate(256, 256)">
          <polygon
            points="0,-89 21,-29 85,-27 34,11 52,72 0,34 -52,72 -34,11 -85,-27 -21,-29"
            fill="#F59E0B"
            fillOpacity="0.25"
            stroke="url(#appLogoSpiral1)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <polygon
            points="0,-89 52,72 -85,-27 85,-27 -52,72"
            fill="none"
            stroke="#FFFBEB"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle cx="0" cy="0" r="4.5" fill="#F59E0B" />
        </g>
      </svg>
    </div>
  );
};

export default AppLogo;
