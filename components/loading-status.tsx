import { LoaderCircle } from 'lucide-react';
export default function LoadingStatus({ children = 'Loading…' }: { children?: React.ReactNode }) {
    return <span className="loading-status" role="status"><LoaderCircle className="loading-spinner" size={17} aria-hidden="true"/>{children}</span>;
}
