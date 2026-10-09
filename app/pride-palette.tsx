"use client";

import { useEffect, useState } from "react";
import { translateText, type Language } from "../lib/i18n";

type Palette = "rainbow" | "mlm" | "trans";

export function PrideIdentity() {
  return <span className="pride-identity" data-no-translate>
    <span className="identity-mlm">GAY / MLM</span>
    <span className="identity-rainbow">RAINBOW PRIDE</span>
    <span className="identity-trans">TRANS PRIDE</span>
  </span>;
}

export function PridePalette({ language }: { language: Language }) {
  const [palette, setPalette] = useState<Palette>("mlm");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("alpha-pride-palette"); } catch { /* Session-only preference. */ }
    const value = saved === "rainbow" || saved === "trans" ? saved : "mlm";
    setPalette(value);
    document.documentElement.dataset.pride = value;
  }, []);

  function change(value: string) {
    const next: Palette = value === "rainbow" || value === "trans" ? value : "mlm";
    setPalette(next);
    try { localStorage.setItem("alpha-pride-palette", next); } catch { /* Session-only preference. */ }
    document.documentElement.dataset.pride = next;
  }

  return <label className="pride-palette">
    <span className="palette-swatch" aria-hidden="true" />
    <span className="sr-only">{translateText("Pride 配色", language)}</span>
    <select value={palette} onChange={(event) => change(event.target.value)}>
      <option value="mlm">Gay · MLM</option>
      <option value="rainbow">Rainbow</option>
      <option value="trans">Trans Pride</option>
    </select>
  </label>;
}
