import React, { useState } from 'react';

export const GoldenRatioIconPreview: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [showGuides, setShowGuides] = useState(true);

  const cx = 256;
  const cy = 256;
  const R = 68;

  const petaloAngles = [0, 60, 120, 180, 240, 300];
  const petaloCenters = petaloAngles.map(deg => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
    };
  });

  const tier2Angles = [30, 90, 150, 210, 270, 330];
  const rSqrt3 = R * Math.sqrt(3);
  const tier2Centers = tier2Angles.map(deg => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + rSqrt3 * Math.cos(rad),
      y: cy + rSqrt3 * Math.sin(rad),
    };
  });

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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-[#1C160C] text-amber-100 border border-amber-500/50 px-4 py-2.5 rounded-full shadow-2xl text-xs font-mono tracking-wider flex items-center gap-2.5 hover:border-amber-400 transition-all hover:scale-105"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
        Ver Icono Dorado: Flor + Doble Espiral + Estrella
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#120E08] border border-amber-500/25 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col items-center">
        {/* Glow ambient dorado cálido */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-yellow-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="w-full flex items-center justify-between pb-4 mb-5 border-b border-amber-500/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-amber-400 font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                Fondo Dorado • Doble Espiral Áurea
              </span>
            </div>
            <h2 className="text-lg font-bold text-amber-100 mt-1 font-display tracking-tight">
              Flor de la Vida con Espiral y Contra-Espiral
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-full border border-amber-500/20 flex items-center justify-center text-amber-300/70 hover:text-amber-100 hover:border-amber-500/40 transition-all text-sm"
          >
            ✕
          </button>
        </div>

        {/* Canvas Display */}
        <div className="relative p-4 bg-[#0A0703] rounded-2xl border border-amber-500/20 shadow-inner flex items-center justify-center group">
          <svg
            viewBox="0 0 512 512"
            className="w-60 h-60 sm:w-72 sm:h-72 drop-shadow-[0_0_50px_rgba(245,158,11,0.25)] select-none"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Fondo Dorado Profundo e Imperial (Golden Noir) */}
              <radialGradient id="cardGoldenLuxeBg" cx="50%" cy="50%" r="72%">
                <stop offset="0%" stopColor="#2E1C07" />
                <stop offset="45%" stopColor="#1C1104" />
                <stop offset="78%" stopColor="#100A02" />
                <stop offset="100%" stopColor="#080501" />
              </radialGradient>

              {/* Halo Dorado Central */}
              <radialGradient id="cardCenterGoldAura" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45" />
                <stop offset="35%" stopColor="#D97706" stopOpacity="0.22" />
                <stop offset="70%" stopColor="#78350F" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>

              {/* Gradiente para la Espiral Principal */}
              <linearGradient id="cardSpiralGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#92400E" />
                <stop offset="35%" stopColor="#D97706" />
                <stop offset="70%" stopColor="#FBBF24" />
                <stop offset="100%" stopColor="#FFFBEB" />
              </linearGradient>

              {/* Gradiente para la Contra-Espiral */}
              <linearGradient id="cardSpiralGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#B45309" />
                <stop offset="35%" stopColor="#F59E0B" />
                <stop offset="70%" stopColor="#FDE68A" />
                <stop offset="100%" stopColor="#FFFFFF" />
              </linearGradient>

              {/* Gradiente Flor de la Vida */}
              <linearGradient id="cardFlowerGradGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFBEB" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#FBBF24" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#B45309" stopOpacity="0.3" />
              </linearGradient>
            </defs>

            {/* Squircle Contenedor Exterior con borde dorado sutil */}
            <rect x="0" y="0" width="512" height="512" rx="118" fill="url(#cardGoldenLuxeBg)" />
            
            {/* Marcos finos dorados concéntricos */}
            <rect x="8" y="8" width="496" height="496" rx="112" stroke="#F59E0B" strokeOpacity="0.2" strokeWidth="1.8" />
            <rect x="18" y="18" width="476" height="476" rx="104" stroke="#FDE68A" strokeOpacity="0.08" strokeWidth="1" />

            {/* Resplandor áureo en el centro */}
            <circle cx={cx} cy={cy} r="210" fill="url(#cardCenterGoldAura)" />

            {/* ================= GUÍAS FIBONACCI (TOGGLEABLE) ================= */}
            {showGuides && (
              <g stroke="#F59E0B" strokeWidth="1" strokeDasharray="3 3" opacity="0.25">
                <circle cx={cx} cy={cy} r="55" />
                <circle cx={cx} cy={cy} r="89" />
                <circle cx={cx} cy={cy} r="144" />
                <circle cx={cx} cy={cy} r="233" strokeOpacity="0.35" />
                <line x1="256" y1="20" x2="256" y2="492" />
                <line x1="20" y1="256" x2="492" y2="256" />
              </g>
            )}

            {/* ================= FLOR DE LA VIDA ================= */}
            <g stroke="url(#cardFlowerGradGold)" strokeWidth="1.4">
              <circle cx={cx} cy={cy} r={R} />
              {petaloCenters.map((pt, i) => (
                <circle key={`cp-${i}`} cx={pt.x} cy={pt.y} r={R} />
              ))}
              {tier2Centers.map((pt, i) => (
                <circle key={`cp2-${i}`} cx={pt.x} cy={pt.y} r={R} strokeOpacity="0.35" />
              ))}
              <circle cx={cx} cy={cy} r={2 * R} stroke="#FBBF24" strokeWidth="1.8" strokeOpacity="0.6" />
            </g>

            {/* ================= ESPIRAL ÁUREA PRINCIPAL ================= */}
            <path
              d={spiralPath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="9"
              strokeLinecap="round"
              strokeOpacity="0.25"
            />
            <path
              d={spiralPath}
              fill="none"
              stroke="url(#cardSpiralGrad1)"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* ================= CONTRA-ESPIRAL ÁUREA EXACTA ================= */}
            <g transform={`rotate(180, ${cx}, ${cy})`}>
              <path
                d={spiralPath}
                fill="none"
                stroke="#FDE68A"
                strokeWidth="8"
                strokeLinecap="round"
                strokeOpacity="0.2"
              />
              <path
                d={spiralPath}
                fill="none"
                stroke="url(#cardSpiralGrad2)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>

            {/* ================= ESTRELLA ÁUREA DE 5 PUNTAS (PENTAGRAMA) ================= */}
            <g transform="translate(256, 256)">
              {/* Pentagrama exterior con relleno áureo sutil */}
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
                fillOpacity="0.2"
                stroke="url(#cardSpiralGrad1)"
                strokeWidth="3.6"
                strokeLinejoin="round"
              />

              {/* Trazado geométrico áureo interno (cruce de 5 puntas) */}
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
                strokeOpacity="0.95"
                strokeLinejoin="round"
              />

              {/* Estrella de lucidez en el centro (R=21) */}
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

            {/* Vértices de resonancia en las 5 puntas */}
            {[-90, -18, 54, 126, 198].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const px = cx + 89 * Math.cos(rad);
              const py = cy + 89 * Math.sin(rad);
              return (
                <g key={`cv-${i}`}>
                  <circle cx={px} cy={py} r="5" fill="#FFFFFF" />
                  <circle cx={px} cy={py} r="10" stroke="#FBBF24" strokeWidth="1.6" strokeOpacity="0.85" />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Resumen de los 4 elementos sagrados */}
        <div className="w-full mt-5 grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
            <div className="text-amber-400 font-mono font-bold">Fondo Dorado</div>
            <div className="text-[9px] text-amber-200/60 uppercase mt-0.5">Golden Noir</div>
          </div>
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
            <div className="text-amber-300 font-mono font-bold">Flor de Vida</div>
            <div className="text-[9px] text-amber-200/60 uppercase mt-0.5">Roseta Sagrada</div>
          </div>
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
            <div className="text-amber-200 font-mono font-bold">Doble Espiral</div>
            <div className="text-[9px] text-amber-200/60 uppercase mt-0.5">Espiral + Contra</div>
          </div>
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
            <div className="text-white font-mono font-bold">Estrella 5 P.</div>
            <div className="text-[9px] text-amber-200/60 uppercase mt-0.5">Pentagrama φ</div>
          </div>
        </div>

        {/* Controles */}
        <div className="w-full flex items-center justify-between mt-5 pt-4 border-t border-amber-500/20">
          <button
            onClick={() => setShowGuides(!showGuides)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all flex items-center gap-1.5 ${
              showGuides
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-white/5 border-white/10 text-amber-200/60 hover:text-amber-100'
            }`}
          >
            <span>{showGuides ? '✓' : '○'}</span> Guías Fibonacci
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-amber-200/60 hover:text-amber-100 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoldenRatioIconPreview;
