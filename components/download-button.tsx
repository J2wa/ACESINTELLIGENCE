'use client';
import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import LoadingStatus from './loading-status';
import { downloadFile } from '@/lib/download-file';
export default function DownloadButton({ href, filename, children, className = 'button', onError }: { href: string; filename: string; children: React.ReactNode; className?: string; onError: (message: string) => void }) {
    const [busy, setBusy] = useState(false), pending = useRef(false);
    async function download() {
        if (pending.current) return;
        pending.current = true; setBusy(true); onError('');
        try { await downloadFile(href, filename); }
        catch (error) { onError((error as Error).message); }
        finally { pending.current = false; setBusy(false); }
    }
    return <button type="button" className={className} onClick={download} disabled={busy} aria-busy={busy}>{busy ? <LoadingStatus>Downloading…</LoadingStatus> : <><Download size={16}/>{children}</>}</button>;
}
