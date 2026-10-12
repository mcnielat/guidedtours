/**
 * Styles live inside a shadow root so host CSS can't break the tour and the
 * tour can't leak into the host. Hosts theme it through CSS custom properties
 * (which do cross the shadow boundary), e.g. `:root { --gt-accent: #e11d48 }`.
 */
export const CSS = /* css */ `
:host {
  all: initial;
  --_accent: var(--gt-accent, #4f46e5);
  --_surface: var(--gt-surface, #ffffff);
  --_ink: var(--gt-ink, #0f172a);
  --_muted: var(--gt-ink-muted, #475569);
  --_faint: var(--gt-ink-faint, #94a3b8);
  --_line: var(--gt-hairline, #e2e8f0);
  --_dim: var(--gt-dim, rgba(15, 23, 42, 0.6));
  --_radius: var(--gt-radius, 14px);
  --_font: var(--gt-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-family: var(--_font);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.blocker { position: fixed; inset: 0; background: transparent; }
.blocker.dim { background: var(--_dim); }

.ring {
  position: fixed; border-radius: 12px; pointer-events: none;
  box-shadow: 0 0 0 9999px var(--_dim);
  outline: 2px solid var(--_accent); outline-offset: 0;
  transition: left .28s cubic-bezier(.4,0,.2,1), top .28s cubic-bezier(.4,0,.2,1),
              width .28s cubic-bezier(.4,0,.2,1), height .28s cubic-bezier(.4,0,.2,1);
}

.pop {
  position: fixed; width: 330px; max-width: calc(100vw - 24px);
  background: var(--_surface); color: var(--_ink); border-radius: var(--_radius);
  box-shadow: 0 20px 50px rgba(0,0,0,.3); padding: 18px;
  font-size: 14px; line-height: 1.5;
  transition: opacity .18s ease;
}
.pop.loading { opacity: 0; pointer-events: none; }
.pop:focus { outline: none; }
.x {
  position: absolute; top: 12px; right: 12px; border: none; cursor: pointer;
  width: 26px; height: 26px; border-radius: 7px; font-size: 17px; line-height: 1;
  background: var(--_line); color: var(--_muted);
}
.badge {
  display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .04em;
  text-transform: uppercase; color: var(--_accent); border-radius: 999px; padding: 3px 10px;
  background: color-mix(in srgb, var(--_accent) 12%, transparent);
}
.title { margin: 11px 30px 6px 0; font-size: 16px; font-weight: 700; color: var(--_ink); }
.body { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--_muted); white-space: pre-line; }
.foot { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; gap: 8px; }
.count { font-size: 12px; color: var(--_faint); font-weight: 600; white-space: nowrap; }
.btns { display: flex; gap: 8px; align-items: center; }
button { font-family: inherit; }
.skip { border: none; background: none; font-size: 12.5px; color: var(--_faint); cursor: pointer; padding: 7px 4px; }
.back {
  border: 1px solid var(--_line); background: var(--_surface); color: var(--_ink); cursor: pointer;
  border-radius: 8px; font-size: 13px; font-weight: 600; padding: 7px 13px;
}
.next {
  border: none; background: var(--_accent); color: #fff; cursor: pointer;
  border-radius: 8px; font-size: 13px; font-weight: 700; padding: 7px 16px;
}
.next:hover { filter: brightness(1.08); }
button:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }

.arrow { position: absolute; width: 14px; height: 14px; background: var(--_surface); transform: rotate(45deg); }
.arrow.on-top { bottom: -7px; }
.arrow.on-bottom { top: -7px; }
.arrow.on-left { right: -7px; }
.arrow.on-right { left: -7px; }

.chooser { position: fixed; inset: 0; background: var(--_dim); display: flex; align-items: center; justify-content: center; padding: 24px; }
.card {
  position: relative; width: 440px; max-width: 100%; background: var(--_surface); color: var(--_ink);
  border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.35); padding: 24px;
}
.card h3 { margin: 0 34px 6px 0; font-size: 19px; }
.card .sub { margin: 0 0 16px; color: var(--_muted); font-size: 13.5px; line-height: 1.5; }
.opt {
  display: flex; width: 100%; text-align: left; gap: 12px; align-items: center; cursor: pointer;
  border: 1px solid var(--_line); background: var(--_surface); color: var(--_ink);
  border-radius: 12px; padding: 13px 14px; margin-top: 10px;
}
.opt:hover { border-color: var(--_accent); }
.opt-t { display: block; font-weight: 700; font-size: 14px; }
.opt-d { display: block; color: var(--_muted); font-size: 12.5px; margin-top: 2px; }
.opt-s { margin-left: auto; font-size: 11px; color: var(--_faint); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) { .ring, .pop { transition: none; } }
`;
