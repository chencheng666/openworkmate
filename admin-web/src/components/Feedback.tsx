import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';

export function LoadingBlock({ label = '正在加载数据' }: { label?: string }) {
  return <div className="loading-block"><LoaderCircle className="spin" size={20} /><span>{label}</span></div>;
}

export function EmptyBlock({ title, description }: { title: string; description: string }) {
  return <div className="empty-block"><CheckCircle2 size={24} /><strong>{title}</strong><span>{description}</span></div>;
}

export function ErrorBanner({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div className="error-banner">
      <AlertCircle size={17} />
      <span>{message}</span>
      {onClose && <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={15} /></button>}
    </div>
  );
}

export function Modal({ title, subtitle, children, onClose, wide = false }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal-panel ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}
