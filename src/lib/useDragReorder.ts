import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragState { from: number; to: number; dx: number; width: number }

const GAP = 8;          // matches gap-2 on the row
const HOLD_MS = 280;    // touch: press-and-hold to pick up (a quick swipe still scrolls the row)
const SLOP = 8;         // px of movement that cancels a pending pick-up
const EDGE = 48;        // px from the row's edge that starts auto-scrolling

/**
 * Drag to reorder items in a horizontally scrolling row. Items need `data-idx`.
 * Touch: hold then drag. Mouse: just drag. A plain tap still clicks.
 */
export function useDragReorder(row: React.RefObject<HTMLDivElement | null>, enabled: boolean, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const st = useRef<{ from: number; startX: number; startContent: number; lefts: number[]; widths: number[]; active: boolean; x: number; timer?: number; raf?: number; to: number; touch: boolean; viaPointer?: boolean } | null>(null);
  const suppressClick = useRef(false);
  const onMoveRef = useRef(onMove); onMoveRef.current = onMove;

  const contentX = (clientX: number) => { const r = row.current!; return clientX - r.getBoundingClientRect().left + r.scrollLeft; };

  const compute = useCallback(() => {
    const s = st.current, r = row.current; if (!s || !s.active || !r) return;
    const dx = contentX(s.x) - s.startContent;
    const center = s.lefts[s.from] + s.widths[s.from] / 2 + dx;
    let to = 0;
    s.lefts.forEach((l, k) => { if (k !== s.from && l + s.widths[k] / 2 < center) to++; });
    s.to = to;
    setDrag({ from: s.from, to, dx, width: s.widths[s.from] });
  }, []);

  const loop = useCallback(() => { // auto-scroll near the edges while dragging
    const s = st.current, r = row.current; if (!s || !s.active || !r) return;
    const rect = r.getBoundingClientRect();
    if (s.x < rect.left + EDGE) r.scrollLeft -= 8; else if (s.x > rect.right - EDGE) r.scrollLeft += 8;
    compute();
    s.raf = requestAnimationFrame(loop);
  }, [compute]);

  const activate = useCallback(() => {
    const s = st.current; if (!s) return;
    s.active = true;
    try { navigator.vibrate?.(30); } catch { /* ignore */ }
    compute();
    s.raf = requestAnimationFrame(loop);
  }, [compute, loop]);

  const end = useCallback(() => {
    const s = st.current; st.current = null;
    if (!s) return;
    clearTimeout(s.timer); if (s.raf) cancelAnimationFrame(s.raf);
    if (s.active) {
      suppressClick.current = true; // cleared when the next touch/press starts, so a late click never opens the menu
      setTimeout(() => { suppressClick.current = false; }, 600);
      if (s.to !== s.from) onMoveRef.current(s.from, s.to);
    }
    setDrag(null);
  }, []);

  const begin = useCallback((target: EventTarget | null, clientX: number, touch: boolean, handle = false) => {
    const r = row.current; if (!enabled || !r) return;
    const el = (target as HTMLElement | null)?.closest?.('[data-idx]') as HTMLElement | null; if (!el) return;
    if (!handle) suppressClick.current = false;
    const items = Array.from(r.querySelectorAll<HTMLElement>('[data-idx]'));
    st.current = { from: Number(el.dataset.idx), startX: clientX, startContent: contentX(clientX), x: clientX, active: false, to: Number(el.dataset.idx), touch,
      lefts: items.map((n) => n.offsetLeft), widths: items.map((n) => n.offsetWidth) };
    if (handle) { st.current.viaPointer = true; suppressClick.current = true; activate(); return; } // grip: drag right away
    if (touch) st.current.timer = window.setTimeout(activate, HOLD_MS);
  }, [enabled, activate]);

  const move = useCallback((clientX: number, ev?: Event) => {
    const s = st.current; if (!s) return;
    s.x = clientX;
    if (!s.active) {
      if (Math.abs(clientX - s.startX) > SLOP) {
        if (s.touch) { clearTimeout(s.timer); st.current = null; return; } // it's a scroll, not a drag
        activate();
      }
      return;
    }
    ev?.preventDefault(); // stop the row scrolling while an item is lifted
    compute();
  }, [activate, compute]);

  useEffect(() => {
    const r = row.current; if (!r) return;
    const onHandle = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('[data-handle]');
    const ts = (e: TouchEvent) => { if (!onHandle(e.target)) begin(e.target, e.touches[0].clientX, true); };
    const tm = (e: TouchEvent) => { if (!st.current?.viaPointer) move(e.touches[0].clientX, e); };
    const te = () => { if (!st.current?.viaPointer) end(); };
    const pd = (e: PointerEvent) => {
      if (onHandle(e.target) && e.button === 0) { // grip: any pointer, starts immediately
        try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
        e.preventDefault(); begin(e.target, e.clientX, e.pointerType !== 'mouse', true); return;
      }
      if (e.pointerType === 'mouse' && e.button === 0) begin(e.target, e.clientX, false);
    };
    const pm = (e: PointerEvent) => { if (e.pointerType === 'mouse' || st.current?.viaPointer) move(e.clientX, e); };
    const pu = (e: PointerEvent) => { if (e.pointerType === 'mouse' || st.current?.viaPointer) end(); };
    const cm = (e: Event) => { if (st.current) e.preventDefault(); }; // no long-press menu on Android
    r.addEventListener('touchstart', ts, { passive: true });
    r.addEventListener('touchmove', tm, { passive: false });
    r.addEventListener('touchend', te); r.addEventListener('touchcancel', te);
    r.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
    r.addEventListener('contextmenu', cm);
    return () => {
      r.removeEventListener('touchstart', ts); r.removeEventListener('touchmove', tm);
      r.removeEventListener('touchend', te); r.removeEventListener('touchcancel', te);
      r.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu);
      r.removeEventListener('contextmenu', cm);
    };
  }); // re-attach every render so listeners always sit on the live row element

  /** Sideways offset for item k while something is being dragged. */
  const shiftFor = (k: number) => {
    if (!drag) return 0;
    if (k === drag.from) return drag.dx;
    const w = drag.width + GAP;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return -w;
    if (drag.to < drag.from && k >= drag.to && k < drag.from) return w;
    return 0;
  };

  return { drag, shiftFor, wasDrag: () => suppressClick.current };
}
