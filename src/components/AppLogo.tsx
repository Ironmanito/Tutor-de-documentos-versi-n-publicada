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
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-accent-systematic/30 to-sky-400/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none" />
      )}
      <svg
        viewBox="0 0 512 512"
        className="w-full h-full relative z-10 drop-shadow-sm select-none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#141418" />
            <stop offset="50%" stopColor="#0E0E11" />
            <stop offset="100%" stopColor="#070709" />
          </linearGradient>

          <linearGradient id="logoBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF4D00" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#FF7A00" stopOpacity="0.3" />
            <stop offset="70%" stopColor="#38BDF8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id="logoAccentOrange" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#E03800" />
            <stop offset="50%" stopColor="#FF4D00" />
            <stop offset="100%" stopColor="#FFA000" />
          </linearGradient>

          <linearGradient id="logoVoiceCyan" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="60%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#BAE6FD" />
          </linearGradient>

          <linearGradient id="logoLeftPage" x1="100%" y1="50%" x2="0%" y2="50%">
            <stop offset="0%" stopColor="#1F1F26" />
            <stop offset="100%" stopColor="#15151B" />
          </linearGradient>

          <linearGradient id="logoRightPage" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#24242D" />
            <stop offset="100%" stopColor="#181820" />
          </linearGradient>

          <radialGradient id="logoCenterGlow" cx="50%" cy="48%" r="45%">
            <stop offset="0%" stopColor="#FF4D00" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#FF4D00" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FF4D00" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Base Squircle */}
        <rect x="0" y="0" width="512" height="512" rx="116" fill="url(#logoBgGrad)" />
        <rect x="6" y="6" width="500" height="500" rx="110" fill="none" stroke="url(#logoBorderGrad)" strokeWidth="4" opacity="0.75" />

        {/* Backdrop Ambient Light */}
        <circle cx="256" cy="245" r="180" fill="url(#logoCenterGlow)" />

        {/* Notebook Body */}
        <g transform="translate(0, 15)">
          <path d="M 96 325 C 160 305 240 315 256 332 C 272 315 352 305 416 325 C 416 338 272 376 256 376 C 240 376 96 338 96 325 Z" fill="#000000" opacity="0.6" />

          {/* Left Page */}
          <path
            d="M 104 316 C 164 298 238 308 252 322 L 252 186 C 238 174 164 162 104 180 Z"
            fill="url(#logoLeftPage)"
            stroke="#38384A"
            strokeWidth="3"
            strokeLinejoin="round"
          />

          {/* Right Page */}
          <path
            d="M 260 322 C 274 308 348 298 408 316 L 408 180 C 348 162 274 174 260 186 Z"
            fill="url(#logoRightPage)"
            stroke="#404054"
            strokeWidth="3"
            strokeLinejoin="round"
          />

          {/* Page Leaf Trim */}
          <path d="M 104 316 L 104 322 C 164 304 238 314 252 328 L 252 322" fill="none" stroke="#FF4D00" strokeWidth="2.5" opacity="0.5" />
          <path d="M 408 316 L 408 322 C 348 304 274 314 260 328 L 260 322" fill="none" stroke="#38BDF8" strokeWidth="2.5" opacity="0.5" />

          {/* Left Page Lines */}
          <line x1="132" y1="210" x2="228" y2="202" stroke="#606078" strokeWidth="4.5" strokeLinecap="round" opacity="0.8" />
          <line x1="132" y1="236" x2="228" y2="228" stroke="#606078" strokeWidth="4.5" strokeLinecap="round" opacity="0.8" />
          <line x1="132" y1="262" x2="200" y2="255" stroke="#606078" strokeWidth="4.5" strokeLinecap="round" opacity="0.6" />
          <line x1="132" y1="288" x2="216" y2="281" stroke="#FF4D00" strokeWidth="4.5" strokeLinecap="round" opacity="0.75" />

          {/* Right Page Lines */}
          <line x1="284" y1="202" x2="380" y2="210" stroke="#606078" strokeWidth="4.5" strokeLinecap="round" opacity="0.8" />
          <line x1="284" y1="228" x2="380" y2="236" stroke="#606078" strokeWidth="4.5" strokeLinecap="round" opacity="0.8" />
          <line x1="284" y1="255" x2="352" y2="262" stroke="#38BDF8" strokeWidth="4.5" strokeLinecap="round" opacity="0.75" />
          <line x1="284" y1="281" x2="368" y2="288" stroke="#606078" strokeWidth="4.5" strokeLinecap="round" opacity="0.6" />

          {/* Central Spine */}
          <line x1="256" y1="182" x2="256" y2="328" stroke="#FF4D00" strokeWidth="3.5" strokeLinecap="round" />
        </g>

        {/* Rising AI Voice Wave Equalizer Bars */}
        <rect x="188" y="142" width="10" height="42" rx="5" fill="url(#logoAccentOrange)" opacity="0.85" />
        <rect x="210" y="112" width="11" height="80" rx="5.5" fill="url(#logoAccentOrange)" />
        <rect x="233" y="86" width="12" height="114" rx="6" fill="url(#logoAccentOrange)" />
        <rect x="267" y="86" width="12" height="114" rx="6" fill="url(#logoAccentOrange)" />
        <rect x="291" y="112" width="11" height="80" rx="5.5" fill="url(#logoVoiceCyan)" />
        <rect x="314" y="142" width="10" height="42" rx="5" fill="url(#logoVoiceCyan)" opacity="0.9" />

        {/* Central AI Sparkle Star */}
        <g transform="translate(256, 68)">
          <path d="M 0 -24 Q 0 0 24 0 Q 0 0 0 24 Q 0 0 -24 0 Q 0 0 0 -24 Z" fill="#FFFFFF" />
          <circle cx="0" cy="0" r="5" fill="#FF4D00" />
        </g>

        {/* Accent Sparkles */}
        <g transform="translate(340, 102)">
          <path d="M 0 -12 Q 0 0 12 0 Q 0 0 0 12 Q 0 0 -12 0 Q 0 0 0 -12 Z" fill="#38BDF8" />
        </g>

        <g transform="translate(172, 116)">
          <path d="M 0 -9 Q 0 0 9 0 Q 0 0 0 9 Q 0 0 -9 0 Q 0 0 0 -9 Z" fill="#FFA000" />
        </g>
      </svg>
    </div>
  );
};

export default AppLogo;
