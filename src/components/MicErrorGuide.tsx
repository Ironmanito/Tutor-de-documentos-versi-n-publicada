import React from 'react';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

export function MicErrorGuide({ onRetry }: { onRetry?: () => void }) {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  return (
    <div className="bg-[#18181b] border border-amber-500/30 rounded-2xl p-5 text-left max-w-xl mx-auto shadow-2xl mt-4 text-slate-200">
      <h4 className="text-amber-400 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        ¿Cómo activar el micrófono en tu dispositivo?
      </h4>
      
      {isIframe ? (
        <>
          <p className="text-slate-300 text-xs mb-3 leading-relaxed">
            Estás visualizando la aplicación dentro del marco de AI Studio (<em>iframe</em>). Los navegadores bloquean el micrófono en marcos seguros.
          </p>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 mb-3">
            <h5 className="font-bold text-xs text-amber-300 mb-1 flex items-center gap-1">
              <ExternalLink className="w-4 h-4 text-amber-400 shrink-0" />
              ¡Solución en 1 paso!
            </h5>
            <p className="text-slate-200 text-xs leading-relaxed mb-2">
              Abre la aplicación en una pestaña propia para que el navegador te solicite permiso de micrófono de forma estándar.
            </p>
            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-md"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir en nueva pestaña
            </a>
          </div>
        </>
      ) : (
        <div className="space-y-2.5 mb-4 text-xs text-slate-300">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <h5 className="font-bold text-xs text-amber-300 mb-1 flex items-center gap-1.5">
              <span className="bg-amber-400 text-black px-1.5 py-0.2 rounded font-mono text-[10px] font-bold">1</span>
              Si ves una "X" arriba a la izquierda (Pestaña interna / Custom Tab)
            </h5>
            <p className="text-slate-200 leading-relaxed text-[11px]">
              Toca los <strong>3 puntos verticales (⋮)</strong> arriba a la derecha y pulsa <strong>"Abrir en Chrome"</strong> o <strong>"Abrir en el navegador"</strong>. Los navegadores integrados de apps suelen bloquear el micrófono.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <h5 className="font-bold text-xs text-slate-100 mb-1 flex items-center gap-1.5">
              <span className="bg-white/20 text-slate-200 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold">2</span>
              Permisos en la barra de Chrome
            </h5>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Toca el icono de <strong>candado o ajustes</strong> a la izquierda de la dirección web (o en los 3 puntos &gt; <em>Configuración del sitio</em>) y asegúrate de cambiar <strong>Micrófono</strong> a <strong>"Permitir"</strong>.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <h5 className="font-bold text-xs text-slate-100 mb-1 flex items-center gap-1.5">
              <span className="bg-white/20 text-slate-200 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold">3</span>
              Ajustes de Android en tu tablet
            </h5>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Ve a <strong>Ajustes del sistema &gt; Aplicaciones &gt; Chrome &gt; Permisos &gt; Micrófono</strong> y verifica que tenga seleccionado <strong>"Permitir solo mientras la app está en uso"</strong>.
            </p>
          </div>
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          type="button"
          className="w-full mt-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
        >
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin-slow" />
          Reintentar activar micrófono ahora
        </button>
      )}
    </div>
  );
}
