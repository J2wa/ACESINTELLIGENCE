// Restore from the server's HttpOnly cookie, never from browser-stored user data.
export async function restoreWorkspace(fetcher = fetch) {
    const options = { credentials: 'same-origin', cache: 'no-store' };
    const response = await fetcher('/api/auth/me', options);
    if (!response.ok) throw new Error('Unable to check your session. Please try again.');
    const auth = await response.json();
    if (!auth || !Object.hasOwn(auth, 'user')) throw new Error('Unable to check your session. Please try again.');
    if (!auth.user) return { auth, data: null };

    const workspace = await fetcher('/api/workspace', options);
    // A session can expire between the two requests.
    if (workspace.status === 401) return { auth: { ...auth, user: null }, data: null };
    if (!workspace.ok) throw new Error('Unable to open your workspace. Please try again.');
    const data = await workspace.json();
    if (!data?.user || data.user.id !== auth.user.id) throw new Error('Unable to open your workspace. Please try again.');
    return { auth, data };
}
