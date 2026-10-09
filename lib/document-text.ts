export async function readPdfLocally(file: File, progress: (value: number) => void) {
  if (file.size > 12 * 1024 * 1024) throw new Error("PDF 需小于 12 MB");
  const pdfjs = await import("pdfjs-dist");
  // Vinext rewrites import.meta.url to a build-time file URL. The emitted asset's
  // pathname is a same-origin web path; its .href would incorrectly use file://.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).pathname;
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  let ocr: import("tesseract.js").Worker | null = null;
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 30) throw new Error("每次最多 30 页，请拆分文件");
    const pages: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      let text = ""; let previousY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (previousY != null && Math.abs(y - previousY) > 3) text += "\n";
        text += item.str + (item.hasEOL ? "\n" : " "); previousY = y;
      }
      if (text.trim().length < 30) {
        if (!ocr) { const { createWorker } = await import("tesseract.js"); ocr = await createWorker(["eng", "chi_sim"]); }
        const base = page.getViewport({scale:1});
        const viewport = page.getViewport({scale:Math.min(2.5,2200/Math.max(base.width,base.height))});
        const canvas = document.createElement("canvas");
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        try { await page.render({canvas,viewport}).promise; text=(await ocr.recognize(canvas,{rotateAuto:true})).data.text; }
        finally { canvas.width=0;canvas.height=0; }
      }
      pages.push(text); page.cleanup(); progress(index / pdf.numPages);
    }
    if (pages.join("").trim().length < 30) throw new Error("PDF 文字与扫描识别均未读出足够内容，请上传更清晰的交易页");
    return pages.join("\n");
  } finally { await ocr?.terminate(); await loading.destroy(); }
}
