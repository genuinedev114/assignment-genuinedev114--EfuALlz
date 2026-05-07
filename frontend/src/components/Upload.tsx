import { useRef, useState } from "react";
import { uploadInvoice } from "../api";

export function Upload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function uploadMany(files: FileList | File[]) {
    setError(null);
    setBusy(true);
    try {
      // Sequential upload keeps UI feedback simple and avoids overwhelming the server.
      // Could parallelize with Promise.all once we add per-file progress.
      for (const f of Array.from(files)) {
        await uploadInvoice(f);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="card upload">
      <h2>Upload invoice</h2>
      <p className="muted">PDF, PNG, JPG, or WebP. Up to 15 MB per file.</p>
      <div
        className="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("over");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("over")}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("over");
          if (e.dataTransfer.files.length) uploadMany(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading…" : "Drop files here or click to choose"}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        multiple
        style={{ display: "none" }}
        onChange={(e) => e.target.files && uploadMany(e.target.files)}
      />
      {error && <div className="error">{error}</div>}
    </div>
  );
}
