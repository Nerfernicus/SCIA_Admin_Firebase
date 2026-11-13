import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Smartphone, ShieldCheck, Phone, MapPin, AlertTriangle, ScanLine, ExternalLink } from 'lucide-react';
import { APP_DOWNLOAD } from '../lib/appDownload';
import logo from '../assets/vallogo.png';

/**
 * Public page where seniors (or OSCA staff helping them) download the SCIA Android app.
 * Address: /SCIA-APP-DOWNLOAD. It is outside the admin dashboard: no login, no sidebar.
 * Written for seniors: large type, one big button, five short steps, Tagalog first.
 * The green button AND the QR code open the Google Drive link set in src/lib/appDownload.js (driveUrl).
 * The QR is shown on every device (phone, tablet, desktop).
 */
const TEXT = {
  fil: {
    brand: 'Office of Senior Citizens Affairs, Lungsod ng Valenzuela',
    title: 'I-download ang SCIA',
    subtitle: 'Ang app ng OSCA para sa mga senior citizen ng Valenzuela: kalusugan, gamot, ID at agarang tulong (SOS) sa iisang app.',
    button: 'I-download ang SCIA para sa Android',
    versionLine: (v, s, r) => ['Bersyon ' + v, s && s + ' MB', r].filter(Boolean).join(' · '),
    soonTitle: 'Malapit nang magamit',
    soonBody: 'Hindi pa handa ang download link. Pumunta sa OSCA Office sa City Hall para matulungan kayong mag-install.',
    driveNote: 'Magbubukas ang Google Drive. Doon, pindutin ang "Download".',
    iosNote: 'Pang-Android na phone lamang ang app sa ngayon.',
    qrTitle: 'I-scan ang QR code',
    qrDesc: 'Gamitin ang camera ng ibang phone. Diretso itong magbubukas sa Google Drive kung nasaan ang SCIA.',
    qrCaption: 'I-scan gamit ang camera ng phone',
    qrOpen: 'Buksan ang Google Drive',
    stepsTitle: 'Paano mag-install (6 hakbang)',
    steps: [
      'Pindutin ang berdeng button sa itaas. Magbubukas ang Google Drive.',
      'Sa Google Drive, pindutin ang "Download" (ang arrow na pababa). Kung may babalang hindi ma-scan ang file, pindutin ang "Download anyway".',
      'Kapag tapos na, buksan ang file na "SCIA" mula sa taas ng screen o sa "Downloads".',
      'Kung sasabihing hindi pinapayagan ang pag-install mula sa source na ito, pindutin ang "Settings" at i-on ang "Payagan mula sa source na ito". Pagkatapos ay bumalik at pindutin ang "Install".',
      'Kung may babala ng Google Play Protect, pindutin ang "More details" at saka "Install anyway". Lumalabas ang babalang ito sa lahat ng app na wala sa Play Store.',
      'Buksan ang SCIA. Pindutin ang "Bisita" para subukan, o mag-login o gumawa ng account.',
    ],
    safeTitle: 'Para sa inyong kaligtasan',
    safeBody: 'Mag-download lamang mula sa pahinang ito (scia-osca.site). Huwag mag-install ng SCIA mula sa mga link na ipinadala ng hindi kilala.',
    helpTitle: 'Kailangan ng tulong sa pag-install?',
    helpBody: 'Pumunta sa OSCA Office sa City Hall ng Valenzuela. Tutulungan kayo ng mga staff.',
    call: 'Tawagan ang OSCA',
    privacy: 'Ginagamit lamang ang lokasyon ng phone kapag binuksan ninyo ang Safety Monitoring o nag-SOS.',
    lang: 'Wika',
  },
  en: {
    brand: 'Office of Senior Citizens Affairs, City of Valenzuela',
    title: 'Download SCIA',
    subtitle: "OSCA's app for the senior citizens of Valenzuela: health, medicines, your ID and quick help (SOS) in one app.",
    button: 'Download SCIA for Android',
    versionLine: (v, s, r) => ['Version ' + v, s && s + ' MB', r].filter(Boolean).join(' · '),
    soonTitle: 'Coming soon',
    soonBody: 'The download link is not ready yet. Please visit the OSCA Office at City Hall and the staff will help you install it.',
    driveNote: 'Google Drive will open. Tap "Download" there.',
    iosNote: 'The app is for Android phones only for now.',
    qrTitle: 'Scan the QR code',
    qrDesc: 'Use the camera of another phone. It opens Google Drive directly, where SCIA is stored.',
    qrCaption: 'Scan with your phone camera',
    qrOpen: 'Open Google Drive',
    stepsTitle: 'How to install (6 steps)',
    steps: [
      'Tap the green button above. Google Drive opens.',
      'In Google Drive, tap "Download" (the arrow pointing down). If it warns that it cannot scan the file, tap "Download anyway".',
      'When it finishes, open the file called "SCIA" from the top of the screen or from "Downloads".',
      'If it says installing from this source is not allowed, tap "Settings" and turn on "Allow from this source". Then go back and tap "Install".',
      'If Google Play Protect shows a warning, tap "More details" and then "Install anyway". This warning appears for every app that is not on the Play Store.',
      'Open SCIA. Tap "Bisita" (Guest) to try it, or log in or make an account.',
    ],
    safeTitle: 'For your safety',
    safeBody: 'Download only from this page (scia-osca.site). Do not install SCIA from links sent by people you do not know.',
    helpTitle: 'Need help installing?',
    helpBody: 'Visit the OSCA Office at Valenzuela City Hall. The staff will help you.',
    call: 'Call OSCA',
    privacy: "The phone's location is used only when you turn on Safety Monitoring or send an SOS.",
    lang: 'Language',
  },
};

const LANG_KEY = 'scia_dl_lang';

export default function AppDownload() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'fil'; } catch { return 'fil'; } // Tagalog first
  });
  const t = TEXT[lang];
  const { driveUrl, version, sizeMb, released, pageUrl, oscaPhone } = APP_DOWNLOAD;

  // The QR opens the Google Drive link directly (falls back to the page if no Drive link is set yet).
  const qrTarget = driveUrl || pageUrl;

  const device = useMemo(() => {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    return 'desktop';
  }, []);

  useEffect(() => {
    const before = document.title;
    document.title = t.title;
    document.documentElement.lang = lang === 'fil' ? 'fil' : 'en';
    return () => { document.title = before; };
  }, [t.title, lang]);

  const choose = (code) => {
    setLang(code);
    try { localStorage.setItem(LANG_KEY, code); } catch { /* storage unavailable */ }
  };
  const phoneDigits = String(oscaPhone || '').replace(/[^\d+]/g, '');

  return (
    <main className="min-h-dvh bg-linear-to-b from-blue-50 to-white text-gray-900 font-sans">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5 sm:px-6 lg:max-w-[1600px] lg:px-10 xl:px-14">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-x-3 gap-y-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="" className="h-12 w-12 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-2xl font-extrabold leading-none text-brand">SCIA</p>
              <p className="text-xs leading-tight text-gray-600 sm:text-sm">{t.brand}</p>
            </div>
          </div>
          <div className="flex shrink-0 rounded-full border-2 border-brand bg-white p-1" role="group" aria-label={t.lang}>
            {[['fil', 'Tagalog'], ['en', 'English']].map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => choose(code)}
                aria-pressed={lang === code}
                className={`min-h-11 rounded-full px-3 text-sm font-bold sm:px-4 ${lang === code ? 'bg-brand text-white' : 'text-brand'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {/* Phones and tablets: one column. Large screens (lg): download + QR on the left, steps on the right. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10 xl:gap-14">
          <div className="lg:sticky lg:top-6">
            <section className="mb-8 text-center">
              <h1 className="mb-3 text-4xl font-extrabold leading-tight sm:text-5xl">{t.title}</h1>
              <p className="mx-auto mb-6 max-w-xl text-xl leading-relaxed text-gray-800">{t.subtitle}</p>

              {device === 'ios' && (
                <p className="mx-auto mb-5 flex max-w-md items-start gap-2 rounded-2xl bg-amber-50 p-4 text-left text-lg font-semibold text-amber-900">
                  <AlertTriangle className="mt-1 shrink-0" size={22} /> {t.iosNote}
                </p>
              )}

              {driveUrl ? (
                <>
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-green-700 px-5 py-4 text-lg font-extrabold text-white shadow-lg sm:text-xl hover:bg-green-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-400 sm:w-auto sm:px-10"
                  >
                    <Download size={30} className="shrink-0" /> <span className="text-left sm:text-center">{t.button}</span>
                  </a>
                  <p className="mt-3 text-lg font-semibold text-gray-800">{t.driveNote}</p>
                  {version && <p className="mt-1 text-base text-gray-700">{t.versionLine(version, sizeMb, released)}</p>}
                </>
              ) : (
                <div className="mx-auto max-w-md rounded-3xl border-2 border-dashed border-brand bg-white p-6 text-left">
                  <p className="mb-1 text-2xl font-extrabold text-brand">{t.soonTitle}</p>
                  <p className="text-lg leading-relaxed text-gray-800">{t.soonBody}</p>
                </div>
              )}
            </section>

            {/* QR card: visible on ALL devices. Scanning opens the Google Drive link directly. */}
            <section
              className="mx-auto mb-8 w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-gray-200"
              aria-labelledby="qr-title"
            >
              <div className="flex items-center justify-center gap-2 bg-brand px-4 py-3 text-white">
                <ScanLine size={24} className="shrink-0" aria-hidden="true" />
                <h2 id="qr-title" className="text-xl font-extrabold">{t.qrTitle}</h2>
              </div>

              <div className="flex flex-col items-center gap-4 px-5 pb-6 pt-5 text-center">
                <p className="flex items-start gap-2 text-left text-base font-semibold leading-relaxed text-gray-800 sm:text-lg">
                  <Smartphone size={22} className="mt-1 shrink-0 text-brand" aria-hidden="true" />
                  {t.qrDesc}
                </p>

                <div className="w-full max-w-56 rounded-3xl border-4 border-brand bg-white p-3 shadow-inner">
                  <QRCodeSVG
                    value={qrTarget}
                    size={224}
                    level="H"
                    marginSize={1}
                    title={t.qrCaption}
                    className="block h-auto w-full"
                    imageSettings={{ src: logo, height: 44, width: 44, excavate: true }}
                  />
                </div>

                <p className="text-base font-extrabold text-brand sm:text-lg">{t.qrCaption}</p>

                {driveUrl && (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-brand px-5 text-base font-bold text-brand hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-400"
                  >
                    <ExternalLink size={20} aria-hidden="true" /> {t.qrOpen}
                  </a>
                )}
              </div>
            </section>
          </div>

          <section className="mb-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
            <h2 className="mb-4 text-2xl font-extrabold">{t.stepsTitle}</h2>
            <ol className="space-y-5">
              {t.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-3 sm:gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-extrabold text-white" aria-hidden="true">{i + 1}</span>
                  <p className="min-w-0 pt-1 text-lg leading-relaxed text-gray-900 sm:text-xl"><span className="sr-only">{i + 1}. </span>{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-stretch lg:gap-10 xl:gap-14">
          <section className="mb-8 flex items-start gap-3 rounded-3xl bg-blue-50 p-5 ring-1 ring-blue-200 lg:mb-0">
            <ShieldCheck className="mt-1 shrink-0 text-brand" size={26} />
            <div>
              <h2 className="mb-1 text-xl font-extrabold">{t.safeTitle}</h2>
              <p className="text-lg leading-relaxed text-gray-800">{t.safeBody}</p>
              <p className="mt-2 text-base leading-relaxed text-gray-700">{t.privacy}</p>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
            <h2 className="mb-2 flex items-start gap-2 text-2xl font-extrabold"><MapPin size={24} className="mt-1 shrink-0" /> {t.helpTitle}</h2>
            <p className="mb-4 text-lg leading-relaxed text-gray-800">{t.helpBody}</p>
            {phoneDigits && (
              <a href={`tel:${phoneDigits}`} className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand px-6 text-lg font-extrabold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-400">
                <Phone size={22} /> {t.call}: {oscaPhone}
              </a>
            )}
          </section>
        </div>

        <footer className="mt-10 text-center text-sm text-gray-600">SCIA · {t.brand}</footer>
      </div>
    </main>
  );
}
