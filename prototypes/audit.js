/* Contrast audit for the prototypes. Loaded on demand from a browser session,
   never by the pages themselves.

   It resolves every computed colour through a 1x1 canvas rather than parsing
   the string, because these palettes compute to oklab() and a regex over that
   silently drops the negative a/b components and reports nonsense. */
function __audit() {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  const cache = new Map();

  const toRGB = (css) => {
    if (cache.has(css)) return cache.get(css);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const value = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    cache.set(css, value);
    return value;
  };

  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = ({ r, g, b }) => {
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (f, b) => {
    const x = lum(f);
    const y = lum(b);
    const [hi, lo] = x > y ? [x, y] : [y, x];
    return (hi + 0.05) / (lo + 0.05);
  };

  /* A solid fill painted as a gradient still paints a solid colour. The sheet
     uses `linear-gradient(paper, paper)` as its first background layer so the
     chevron can occupy the border box behind it, and treating that as
     "transparent" would measure every caption against the page ground two
     levels up and report dark-on-dark nonsense. */
  /* Split background-image into its layers at top-level commas only. A naive
     regex splits inside rgb(238, 241, 248) and silently drops the layer. */
  const topLevelLayers = (value) => {
    const layers = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if (ch === "," && depth === 0) {
        layers.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    layers.push(value.slice(start).trim());
    return layers;
  };

  const flatGradientColour = (backgroundImage) => {
    const first = topLevelLayers(backgroundImage)[0];
    if (!first.startsWith("linear-gradient(")) return null;
    const stops = first.match(
      /(?:rgba?|oklab|oklch|color|hsla?|lab|lch)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-f]{3,8}/gi,
    );
    if (!stops || stops.length < 2) return null;
    const unique = new Set(
      stops.map((s) => {
        return JSON.stringify(toRGB(s));
      }),
    );
    return unique.size === 1 ? toRGB(stops[0]) : null;
  };

  const bgOf = (el) => {
    let node = el;
    while (node) {
      const s = getComputedStyle(node);
      const own = toRGB(s.backgroundColor);
      if (own.a > 0.85) return own;
      if (s.backgroundImage !== "none") {
        const flat = flatGradientColour(s.backgroundImage);
        if (flat) return flat;
        return null; // A photograph or a real gradient; not statically measurable.
      }
      node = node.parentElement;
    }
    return toRGB(getComputedStyle(document.body).backgroundColor);
  };

  const scan = () => {
    const failures = [];
    let checked = 0;
    document.querySelectorAll("*").forEach((el) => {
      const hasText = Array.from(el.childNodes).some((n) => {
        return n.nodeType === 3 && n.textContent.trim().length > 1;
      });
      if (!hasText) return;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") return;
      if (Number(s.opacity) < 0.5) return;
      const bg = bgOf(el);
      if (!bg) return;
      checked += 1;
      const size = parseFloat(s.fontSize);
      const weight = Number(s.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(toRGB(s.color), bg);
      if (got < need) {
        failures.push({
          sel:
            el.tagName.toLowerCase() +
            (typeof el.className === "string" && el.className
              ? "." + el.className.trim().split(/\s+/).join(".")
              : ""),
          text: el.textContent.trim().slice(0, 40),
          size,
          weight,
          got: Math.round(got * 100) / 100,
          need,
        });
      }
    });
    return { checked, failures };
  };

  /* Scan only the rendition this page actually loaded with. Flipping the
     attribute and re-scanning in the same session reports stale colours (see
     the note in app.js), so each rendition is audited on its own fresh load. */
  const report = {
    page: location.pathname,
    rendition: document.documentElement.dataset.rendition,
    result: scan(),
  };

  /* Tap targets and text size, the other two halves of the older-adult floor
     recorded in PRODUCT.md. */
  const small = [];
  document
    .querySelectorAll("a, button, input, textarea, [tabindex]")
    .forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      if (box.height < 44 || box.width < 24) {
        small.push({
          sel:
            el.tagName.toLowerCase() +
            (el.className
              ? "." + String(el.className).trim().split(/\s+/)[0]
              : ""),
          label: (el.getAttribute("aria-label") || el.textContent || "")
            .trim()
            .slice(0, 30),
          h: Math.round(box.height),
          w: Math.round(box.width),
        });
      }
    });
  report.smallTargets = small;

  const tiny = [];
  document.querySelectorAll("*").forEach((el) => {
    const hasText = Array.from(el.childNodes).some((n) => {
      return n.nodeType === 3 && n.textContent.trim().length > 1;
    });
    if (!hasText) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 15) {
      tiny.push({ text: el.textContent.trim().slice(0, 28), size });
    }
  });
  report.tinyText = tiny;

  /* Horizontal overflow, the thing that actually breaks on a phone. */
  report.overflow = {
    docWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    overflows: document.documentElement.scrollWidth > window.innerWidth + 1,
  };

  return report;
}
