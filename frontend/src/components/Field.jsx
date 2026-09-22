import { useLang } from '../i18n.jsx';

// Campo de formulário personalizado: rótulo, controlo (children), dica e erro.
// O erro é ligado ao input pelo id `${id}-err` (aria-describedby).
export default function Field({ id, label, optional, error, hint, children }) {
  const { t } = useLang();
  return (
    <div className={`field${error ? ' has-err' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <em> · {t('f.optional')}</em>}
      </label>
      {children}
      {error ? (
        <p className="msg err" id={`${id}-err`} role="alert">{error}</p>
      ) : hint ? (
        <p className="msg">{hint}</p>
      ) : null}
    </div>
  );
}
