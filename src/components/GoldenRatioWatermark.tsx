import React from 'react';

interface GoldenWatermarkProps {
  className?: string;
}

export const GoldenRatioWatermark: React.FC<GoldenWatermarkProps> = ({ className = '' }) => {
  const cx = 256;
  const cy = 256;
  const R = 68;

  // Tier 1: 6 circles around the center (Seed / Flower of Life)
  const petaloAngles = [0, 60, 120, 180, 240, 300];
  const petaloCenters = petaloAngles.map(deg => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
    };
  });

  // Tier 2: 6 secondary harmonizing circles
  const tier2Angles = [30, 90, 150, 210, 270, 330];
  const rSqrt3 = R * Math.sqrt(3);
  const tier2Centers = tier2Angles.map(deg => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + rSqrt3 * Math.cos(rad),
      y: cy + rSqrt3 * Math.sin(rad),
    };
  });

  // Pure Fibonacci Golden Spiral Arc Path (from center outward through radii 13, 21, 34, 55, 89, 144, 233)
  const spiralPath = `
    M 256 256
    A 13 13 0 0 1 243 269
    A 21 21 0 0 1 222 248
    A 34 34 0 0 1 256 214
    A 55 55 0 0 1 311 269
    A 89 89 0 0 1 222 358
    A 144 144 0 0 1 78 214
    A 233 233 0 0 1 311 -19
  `;

  return (
    <div className={`pointer-events-none select-none flex items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 512 512"
        className="w-full h-full max-w-[660px] max-h-[660px] drop-shadow-[0_0_120px_rgba(234,179,8,0.2)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Fondo y Halo Dorado Imperial / Oro Alquímico */}
          <radialGradient id="watermarkGoldenAtmosphere" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#EAB308" stopOpacity="0.32" />
            <stop offset="35%" stopColor="#D97706" stopOpacity="0.18" />
            <stop offset="65%" stopColor="#78350F" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* Gradiente Dorado para la Espiral Principal */}
          <linearGradient id="primarySpiralGold" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="40%" stopColor="#F59E0B" />
            <stop offset="80%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>

          {/* Gradiente Dorado para la Contra-Espiral */}
          <linearGradient id="counterSpiralGold" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="40%" stopColor="#FBBF24" />
            <stop offset="80%" stopColor="#FEF3C7" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>

          {/* Resplandor Flor de la Vida */}
          <linearGradient id="sacredFlowerGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.5" />
            <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#B45309" stopOpacity="0.2" />
          </linearGradient>

          {/* Estrella Pentagrama Glow */}
          <radialGradient id="pentagramAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFBEB" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#FDE68A" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#F59E0B" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#B45309" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Resplandor Atmosférico Dorado de Fondo */}
        <circle cx={cx} cy={cy} r="240" fill="url(#watermarkGoldenAtmosphere)" />

        {/* Anillos Fibonacci y Guías Áureas Doradas */}
        <g stroke="#F59E0B" strokeOpacity="0.16" strokeWidth="1.2" strokeDasharray="5 5">
          <circle cx={cx} cy={cy} r="55" />
          <circle cx={cx} cy={cy} r="89" />
          <circle cx={cx} cy={cy} r="144" />
          <circle cx={cx} cy={cy} r="233" strokeOpacity="0.25" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="248" stroke="#FDE68A" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="2 6" />
        </g>

        {/* ================= 1. FLOR DE LA VIDA (GEOMETRÍA SAGRADA) ================= */}
        <g id="flower-of-life" stroke="url(#sacredFlowerGold)" strokeWidth="1.4">
          <circle cx={cx} cy={cy} r={R} />
          {petaloCenters.map((pt, i) => (
            <circle key={`w-t1-${i}`} cx={pt.x} cy={pt.y} r={R} />
          ))}
          {tier2Centers.map((pt, i) => (
            <circle key={`w-t2-${i}`} cx={pt.x} cy={pt.y} r={R} strokeOpacity="0.3" />
          ))}
          {/* Anillo de contención de la flor */}
          <circle cx={cx} cy={cy} r={2 * R} stroke="#FBBF24" strokeWidth="1.8" strokeOpacity="0.55" />
        </g>

        {/* ================= 2. DOBLE ESPIRAL ÁUREA (ESPIRAL + CONTRA-ESPIRAL) ================= */}
        {/* Espiral 1: Principal Áurea Continua */}
        <g id="primary-golden-spiral">
          {/* Halo suave de la espiral */}
          <path
            d={spiralPath}
            fill="none"
            stroke="#F59E0B"
            strokeWidth="9"
            strokeLinecap="round"
            strokeOpacity="0.2"
          />
          {/* Trazo nítido principal */}
          <path
            d={spiralPath}
            fill="none"
            stroke="url(#primarySpiralGold)"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
        </g>

        {/* Espiral 2: CONTRA-ESPIRAL ÁUREA EXACTA (Rotada 180° para crear el vórtice armónico dual) */}
        <g id="counter-golden-spiral" transform={`rotate(180, ${cx}, ${cy})`}>
          {/* Halo de la contra-espiral */}
          <path
            d={spiralPath}
            fill="none"
            stroke="#FDE68A"
            strokeWidth="8"
            strokeLinecap="round"
            strokeOpacity="0.18"
          />
          {/* Trazo nítido de la contra-espiral */}
          <path
            d={spiralPath}
            fill="none"
            stroke="url(#counterSpiralGold)"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
        </g>

        {/* ================= 3. ESTRELLA DE 5 PUNTAS (PENTAGRAMA ÁUREO) ================= */}
        <g id="golden-pentagram" transform="translate(256, 256)">
          {/* Anillo delimitador áureo del pentagrama (R=89) */}
          <circle cx="0" cy="0" r="89" stroke="#FDE68A" strokeWidth="1.2" strokeOpacity="0.35" strokeDasharray="4 4" />
          
          {/* Centro radiante */}
          <circle cx="0" cy="0" r="50" fill="url(#pentagramAura)" opacity="0.4" />

          {/* Polígono relleno de la estrella de 5 puntas */}
          <polygon
            points="
              0,-89
              21,-29
              85,-27
              34,11
              52,72
              0,34
              -52,72
              -34,11
              -85,-27
              -21,-29
            "
            fill="#F59E0B"
            fillOpacity="0.18"
            stroke="url(#primarySpiralGold)"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* Trazado geométrico interno del Pentagrama (Líneas áureas cruzadas) */}
          <polygon
            points="
              0,-89
              52,72
              -85,-27
              85,-27
              -52,72
            "
            fill="none"
            stroke="#FFFBEB"
            strokeWidth="2.2"
            strokeOpacity="0.9"
            strokeLinejoin="round"
          />

          {/* Estrella micro-núcleo de lucidez pura */}
          <polygon
            points="
              0,-21
              5,-7
              20,-6
              8,3
              12,17
              0,8
              -12,17
              -8,3
              -20,-6
              -5,-7
            "
            fill="#FFFFFF"
            stroke="#F59E0B"
            strokeWidth="1.2"
          />
          <circle cx="0" cy="0" r="4" fill="#F59E0B" />
        </g>

        {/* Nodos de Resonancia en los 5 Vértices de la Estrella */}
        {[-90, -18, 54, 126, 198].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const px = cx + 89 * Math.cos(rad);
          const py = cy + 89 * Math.sin(rad);
          return (
            <g key={`w-vertex-${i}`}>
              <circle cx={px} cy={py} r="5" fill="#FFFFFF" />
              <circle cx={px} cy={py} r="10" stroke="#FBBF24" strokeWidth="1.5" strokeOpacity="0.8" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
