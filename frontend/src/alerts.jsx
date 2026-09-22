import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from './i18n.jsx';

const Ctx = createContext(null);
export const useAlert = () => useContext(Ctx);

const ICON = {
  success: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  error: <path d="M6 6l12 12M18 6L6 18" />,
  warning: <path d="M12 7v6M12 17h.01" />,
  info: <path d="M12 11v6M12 7h.01" />,
};

function Toast({ toast, dismiss }) {
  const { t } = useLang();
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(id);
  }, [toast, dismiss]);

  return (
    <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <span className="toast-ico">
        <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[toast.type]}</svg>
      </span>
      <div className="toast-body">
        <strong>{toast.title || t(`alert.title.${toast.type}`)}</strong>
        <span>{toast.message}</span>
      </div>
      <button className="toast-x" onClick={() => dismiss(toast.id)} aria-label={t('alert.close')}>×</button>
      <i className="toast-bar" style={{ animationDuration: `${toast.duration}ms` }} />
    </div>
  );
}

function ConfirmDialog({ dlg, close }) {
  const { t } = useLang();
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div className="overlay center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-text">
        <h2 id="dlg-title">{dlg.title}</h2>
        <p id="dlg-text">{dlg.message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn ghost" onClick={() => close(false)}>{dlg.cancelText || t('alert.cancel')}</button>
          <button className={`btn${dlg.danger ? ' danger' : ''}`} onClick={() => close(true)}>{dlg.confirmText || t('alert.confirm')}</button>
        </div>
      </div>
    </div>
  );
}

export function AlertProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const counter = useRef(0);

  const dismiss = useCallback((id) => setToasts((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((type, message, opts = {}) => {
    const id = ++counter.current;
    setToasts((l) => [...l.slice(-2), { id, type, message, title: opts.title, duration: opts.duration ?? 4500 }]);
    return id;
  }, []);
  const confirm = useCallback((opts) => new Promise((resolve) => setDlg({ ...opts, resolve })), []);

  const api = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, { duration: 6000, ...o }),
    warning: (m, o) => push('warning', m, o),
    info: (m, o) => push('info', m, o),
    confirm,
    dismiss,
  }), [push, confirm, dismiss]);

  const closeDlg = useCallback((result) => {
    setDlg((d) => { d?.resolve(result); return null; });
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((x) => <Toast key={x.id} toast={x} dismiss={dismiss} />)}
      </div>
      {dlg && <ConfirmDialog dlg={dlg} close={closeDlg} />}
    </Ctx.Provider>
  );
}
