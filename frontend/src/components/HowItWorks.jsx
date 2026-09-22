import { useLang } from '../i18n.jsx';

export default function HowItWorks() {
  const { t } = useLang();
  return (
    <section className="section" id="como">
      <div className="wrap">
        <h2 className="h2">{t('how.title')}</h2>
        <ol className="steps">
          {[1, 2, 3].map((n) => (
            <li key={n}>
              <span className="num">{n}</span>
              <h3>{t(`how.${n}.t`)}</h3>
              <p>{t(`how.${n}.d`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
