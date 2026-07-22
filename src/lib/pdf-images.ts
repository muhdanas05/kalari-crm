/**
 * Helpers for resolving image sources into data-URL PNGs the
 * @react-pdf/renderer Image component can embed.
 *
 * react-pdf doesn't accept SVG, and refuses to embed images it can't fetch
 * synchronously inside a browser. Resolving everything to PNG data URLs
 * ahead of time keeps the document deterministic.
 */

async function imageToDataUrl(url: string, w = 800, h = 600): Promise<string> {
  // SVG source → render via Image + canvas → PNG.
  const isSvg = url.toLowerCase().endsWith(".svg");
  return await new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const naturalW = img.naturalWidth || w;
        const naturalH = img.naturalHeight || h;
        canvas.width = naturalW;
        canvas.height = naturalH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = url + (isSvg ? `?_=${Date.now()}` : "");
  });
}

export async function resolveLogo(): Promise<string> {
  return imageToDataUrl("/logo.png");
}

export async function resolvePhotos(
  photos: { id: string; src: string }[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    photos.map(async (p) => {
      try {
        const dataUrl = await imageToDataUrl(p.src);
        return [p.id, dataUrl] as const;
      } catch {
        return [p.id, ""] as const;
      }
    })
  );
  return Object.fromEntries(entries.filter(([, v]) => v));
}
