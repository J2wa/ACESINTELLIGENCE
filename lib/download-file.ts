export async function downloadFile(url: string, fallbackName: string) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(90000) });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Download failed. Please try again.');
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('The download was empty. Please try again.');
    const name = response.headers.get('Content-Disposition')?.match(/filename="([^"/\\]+)"/)?.[1] ?? fallbackName;
    const objectUrl = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = objectUrl; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}
