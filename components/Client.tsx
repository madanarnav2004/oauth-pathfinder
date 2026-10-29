"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function CopyButton({ text, label, quiet }: { text?: string; label: string; quiet?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn${quiet ? " quiet" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text ?? window.location.href);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          window.prompt("Copy this:", text ?? window.location.href);
        }
      }}
    >
      {done ? "copied" : label}
    </button>
  );
}

export function ProbeButton({ slug }: { slug: string }) {
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn quiet"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setOut(null);
          try {
            const r = await fetch(`/api/probe?slug=${encodeURIComponent(slug)}`);
            const j = (await r.json()) as { lines?: string[]; error?: string; checkedAt?: string };
            setOut(j.lines?.length ? `${j.lines.join("\n")}\n(no credentials sent, ${j.checkedAt})` : j.error ?? "No response from the provider.");
          } catch {
            setOut("Couldn't reach the probe endpoint.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "probing…" : "run live probe"}
      </button>
      {out && <pre className="probe-out" style={{ flexBasis: "100%" }}>{out}</pre>}
    </>
  );
}

type Line = { stage: string; msg: string; err?: boolean };

export function GenerateRunner({ q }: { q: string }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([{ stage: "start", msg: `Looking up ${q}.` }]);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const push = (l: Line) => setLines((x) => [...x, l]);
    (async () => {
      try {
        const res = await fetch(`/api/generate?q=${encodeURIComponent(q)}`);
        if (!res.body) throw new Error("no stream");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done: d } = await reader.read();
          if (d) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i).trim();
            buf = buf.slice(i + 2);
            if (!chunk.startsWith("data:")) continue;
            const ev = JSON.parse(chunk.slice(5)) as { type: string; stage?: string; msg?: string; url?: string; message?: string; code?: string; reason?: string; app?: string };
            if (ev.type === "event") push({ stage: ev.stage!, msg: ev.msg! });
            else if (ev.type === "error") {
              push({ stage: ev.code ?? "error", msg: ev.message ?? "Something went wrong.", err: true });
              setDone(true);
            } else if (ev.type === "no_oauth") {
              push({ stage: "no oauth", msg: `${ev.app}: ${ev.reason}`, err: true });
              setDone(true);
            } else if (ev.type === "result") {
              push({ stage: "done", msg: "Guide ready." });
              const u = new URL(ev.url!);
              router.replace(`${u.pathname}${u.search}`);
              return;
            }
          }
        }
        setDone(true);
      } catch (e) {
        push({ stage: "error", msg: (e as Error).message, err: true });
        setDone(true);
      }
    })();
  }, [q, router]);

  return (
    <div className="log" aria-live="polite">
      {lines.map((l, i) => (
        <div key={i} className={`l${l.err ? " err" : ""}`}>
          <span className="st">{l.stage}</span>
          <span className={i === lines.length - 1 && !done ? "cursor" : ""}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}
