"use client";

import { useEffect } from "react";

export function PersianFontReadyMarker() {
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) document.documentElement.dataset.reportFontsReady = "true";
    });
    return () => {
      active = false;
    };
  }, []);

  return null;
}

