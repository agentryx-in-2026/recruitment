import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

/**
 * Screenshot picker used wherever a tester attaches images (findings, test results).
 * Piyush, 18 Nov 2026: paste with Ctrl+V, choose files, or drag them in; SVG accepted;
 * every image is previewed straight away so the tester can check it is the right one.
 */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_BYTES = 10 * 1024 * 1024;

export function ShotPicker({ files, onChange, max = 5, existing = 0, label = "Screenshots" }: {
  files: File[]; onChange: (f: File[]) => void; max?: number; existing?: number; label?: string;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const room = Math.max(0, max - existing);
  const latest = useRef(files);
  latest.current = files;

  const add = (incoming: File[]) => {
    setErr(null);
    const ok: File[] = [];
    for (const f of incoming) {
      if (!IMAGE_TYPES.includes(f.type)) { setErr(`${f.name || "That file"} is not an image (PNG, JPG, WEBP, GIF or SVG).`); continue; }
      if (f.size > MAX_BYTES) { setErr(`${f.name} is larger than 10 MB.`); continue; }
      ok.push(f);
    }
    const next = [...latest.current, ...ok];
    if (next.length > room) setErr(`Up to ${max} screenshots${existing ? ` in all (${existing} already attached)` : ""}.`);
    onChange(next.slice(0, room));
  };

  // Ctrl+V anywhere on the page while this picker is shown. Text pastes are left alone.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (!items.length) return;
      e.preventDefault();
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
      add(items.map((i, n) => {
        const f = i.getAsFile()!;
        const ext = f.type === "image/svg+xml" ? "svg" : f.type.split("/")[1] || "png";
        return new File([f], f.name && f.name !== "image.png" ? f.name : `pasted-${stamp}${n ? `-${n + 1}` : ""}.${ext}`, { type: f.type });
      }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [room]);

  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files ?? [])); }}
        className={`rounded-md border-2 border-dashed px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${over ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}>
        <ImagePlus className="w-4 h-4 text-slate-500" />
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">Paste with <kbd className="rounded border border-slate-300 bg-white px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border border-slate-300 bg-white px-1 text-xs">V</kbd>, drag here, or</span>
        <button type="button" onClick={() => input.current?.click()} disabled={!room} className="text-indigo-700 font-medium hover:underline disabled:text-slate-400">choose files</button>
        <span className="text-xs text-slate-400">PNG, JPG, WEBP, GIF, SVG · up to {max}{existing ? ` (${existing} attached)` : ""}</span>
        <input ref={input} type="file" accept={IMAGE_TYPES.join(",")} multiple className="hidden"
          onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {err && <p className="mt-1.5 text-sm text-rose-700">{err}</p>}
      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3" aria-label="Screenshots to upload">
          {files.map((f, i) => (
            <li key={urls[i]} className="relative">
              <a href={urls[i]} target="_blank" rel="noreferrer"><img src={urls[i]} alt={f.name} className="h-28 max-w-[220px] rounded border border-slate-200 object-contain bg-white" /></a>
              <span className="block max-w-[220px] truncate text-[11px] text-slate-500 mt-0.5">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute -top-2 -right-2 rounded-full bg-white border border-slate-300 p-0.5 text-slate-600 hover:text-rose-700 shadow-sm"><X className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
