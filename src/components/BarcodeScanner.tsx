import { useEffect, useRef, useState } from 'react';
import { Btn } from './ui';

/** Camera barcode scanner (Chrome on Android supports BarcodeDetector). Falls back to typing the number. */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'unsupported' | 'denied'>('starting');
  const [manual, setManual] = useState('');

  useEffect(() => {
    const Detector = (window as any).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) { setStatus('unsupported'); return; }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    (async () => {
      try {
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setStatus('scanning');
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) { clearInterval(timer); try { navigator.vibrate?.(80); } catch { /* ignore */ } onCode(codes[0].rawValue); }
          } catch { /* keep trying */ }
        }, 300);
      } catch { setStatus('denied'); }
    })();
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);

  return (
    <div className="space-y-3">
      {(status === 'starting' || status === 'scanning') && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-sun/80" />
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-chalk">{status === 'starting' ? 'Starting camera…' : 'Point at the barcode'}</p>
        </div>
      )}
      {status === 'unsupported' && <p className="text-sm text-haze">This browser can’t scan barcodes with the camera. Type the number under the barcode instead.</p>}
      {status === 'denied' && <p className="text-sm text-haze">Camera access was blocked. Allow it in your browser settings, or type the number under the barcode.</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = manual.replace(/\D/g, ''); if (c.length >= 8) onCode(c); }}>
        <input inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type the barcode number" aria-label="Barcode number"
          className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun" />
        <Btn type="submit" variant="ghost" disabled={manual.replace(/\D/g, '').length < 8}>Look up</Btn>
      </form>
    </div>
  );
}
