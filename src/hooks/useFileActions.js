import { useCallback } from 'react';

function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

// The done-file actions for the active file: download, native share, and redo
// (reset to ready, releasing the output URL). Kept out of App so the component
// body stays a thin composition root.
export default function useFileActions(active, showToast, updateFile) {
  const download = useCallback(() => {
    if (!active || !active.outUrl) return;
    const link = document.createElement('a');
    link.href = active.outUrl;
    link.download = `${baseName(active.name)}_limbo.${active.outExt || 'mp4'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Download started');
  }, [active, showToast]);

  const share = useCallback(async () => {
    if (!active || !active.outBlob) return;
    const shareFile = new File(
      [active.outBlob],
      `${baseName(active.name)}_limbo.${active.outExt || 'mp4'}`,
      { type: active.outMime || 'video/mp4' },
    );
    if (!(navigator.canShare && navigator.canShare({ files: [shareFile] }))) {
      showToast('Sharing files is not supported in this browser');
      return;
    }
    try {
      await navigator.share({ files: [shareFile] });
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Sharing failed', 'error');
    }
  }, [active, showToast]);

  const redo = useCallback(() => {
    if (!active) return;
    if (active.outUrl) URL.revokeObjectURL(active.outUrl);
    updateFile(active.id, {
      status: 'ready',
      progress: 0,
      outUrl: null,
      outBlob: null,
      outBytes: null,
      outMime: null,
      outExt: null,
    });
  }, [active, updateFile]);

  return { download, share, redo };
}
