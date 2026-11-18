import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useStore } from '../store';
import { respond, type CoachAction } from '../lib/coach';
import { startSession } from '../lib/session';
import { Btn, cx } from '../components/ui';

interface Msg { from: 'you' | 'coach'; text: string; actions?: CoachAction[] }

const PROMPTS = ['What did I lift last time?', 'What should I lift next session?', 'I just did 60 lb on chest press. It was easy.', 'I feel overwhelmed today.'];

export default function Coach() {
  const { data, update, go } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: 'coach', text: 'Hey. I can look up your saved workouts, suggest weights, or help you scale today’s plan. I only answer from what you’ve logged.' },
  ]);
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const r = respond(text, data);
    setMsgs((m) => [...m, { from: 'you', text }, { from: 'coach', text: r.text, actions: r.actions }]);
    setInput('');
  };
  const act = (a: CoachAction) => { update((d) => startSession(d, a === 'start-quick' ? 'quick' : 'full')); go('train'); };

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 pb-40 pt-safe">
      <header className="pb-4 pt-4">
        <p className="text-sm text-haze">Training help, not medical advice</p>
        <h1 className="font-display text-4xl font-semibold leading-none">Coach</h1>
      </header>
      <div className="flex-1 space-y-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={cx('max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3', m.from === 'you' ? 'ml-auto bg-sun text-ink' : 'bg-deck border border-rim')}>
            {m.text}
            {m.actions && (
              <div className="mt-3 flex gap-2">
                {m.actions.map((a) => <Btn key={a} variant={a === 'start-quick' ? 'tide' : 'primary'} onClick={() => act(a)}>{a === 'start-quick' ? 'Start 15 minutes' : 'Start workout'}</Btn>)}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="fixed inset-x-0 bottom-[76px] mx-auto max-w-xl bg-ink/95 px-4 pb-3 pt-2 backdrop-blur pb-safe">
        <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1">
          {PROMPTS.map((p) => (
            <button key={p} onClick={() => send(p)} className="min-h-[36px] shrink-0 rounded-full border border-rim px-3 text-sm text-haze active:bg-rim">{p}</button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach" aria-label="Message the coach"
            className="min-h-[48px] flex-1 rounded-xl border border-rim bg-deck px-4 outline-none focus:border-sun" />
          <Btn type="submit" aria-label="Send"><Send size={18} /></Btn>
        </form>
      </div>
    </div>
  );
}
