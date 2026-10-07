// Lightweight i18n for English, Hindi and Kannada (SRS 5.4.3). Key UI strings are translated;
// untranslated keys fall back to English.
import { createContext, useContext, useEffect, useState } from 'react';

const S = {
  en: { find: 'Find jobs', employers: 'For employers', help: 'Help', news: 'News', signin: 'Sign in', join: 'Create account', dashboard: 'Dashboard', signout: 'Sign out',
    hero1: 'Work that fits', hero2: 'what you can do.', heroSub: 'SkillSetu matches your skills, education and location with verified jobs across India, and shows you exactly why each job fits.',
    lookingFor: "I'm looking for", workIn: 'work in', anyCity: 'any city', search: 'Search jobs', latest: 'Latest jobs', browse: 'Browse by sector', match: 'match', apply: 'Apply now', save: 'Save', saved: 'Saved',
    profile: 'Profile', applications: 'Applications', savedJobs: 'Saved jobs', alerts: 'Job alerts', notifications: 'Notifications', settings: 'Settings', recommended: 'Recommended for you', skip: 'Skip to content' },
  hi: { find: 'नौकरियाँ खोजें', employers: 'नियोक्ताओं के लिए', help: 'सहायता', news: 'समाचार', signin: 'साइन इन', join: 'खाता बनाएँ', dashboard: 'डैशबोर्ड', signout: 'साइन आउट',
    hero1: 'ऐसा काम जो', hero2: 'आपके हुनर से मेल खाए।', heroSub: 'SkillSetu आपके कौशल, शिक्षा और स्थान को पूरे भारत की सत्यापित नौकरियों से मिलाता है, और बताता है कि हर नौकरी क्यों उपयुक्त है।',
    lookingFor: 'मुझे चाहिए', workIn: 'काम, शहर', anyCity: 'कोई भी शहर', search: 'नौकरी खोजें', latest: 'नई नौकरियाँ', browse: 'क्षेत्र के अनुसार देखें', match: 'मेल', apply: 'आवेदन करें', save: 'सहेजें', saved: 'सहेजा गया',
    profile: 'प्रोफ़ाइल', applications: 'आवेदन', savedJobs: 'सहेजी नौकरियाँ', alerts: 'जॉब अलर्ट', notifications: 'सूचनाएँ', settings: 'सेटिंग्स', recommended: 'आपके लिए सुझाव', skip: 'मुख्य सामग्री पर जाएँ' },
  kn: { find: 'ಉದ್ಯೋಗ ಹುಡುಕಿ', employers: 'ಉದ್ಯೋಗದಾತರಿಗೆ', help: 'ಸಹಾಯ', news: 'ಸುದ್ದಿ', signin: 'ಸೈನ್ ಇನ್', join: 'ಖಾತೆ ತೆರೆಯಿರಿ', dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', signout: 'ಸೈನ್ ಔಟ್',
    hero1: 'ನಿಮ್ಮ ಕೌಶಲ್ಯಕ್ಕೆ', hero2: 'ಹೊಂದುವ ಕೆಲಸ.', heroSub: 'SkillSetu ನಿಮ್ಮ ಕೌಶಲ್ಯ, ಶಿಕ್ಷಣ ಮತ್ತು ಸ್ಥಳವನ್ನು ಭಾರತದಾದ್ಯಂತ ಪರಿಶೀಲಿಸಿದ ಉದ್ಯೋಗಗಳೊಂದಿಗೆ ಹೊಂದಿಸುತ್ತದೆ.',
    lookingFor: 'ನನಗೆ ಬೇಕು', workIn: 'ಕೆಲಸ, ನಗರ', anyCity: 'ಯಾವುದೇ ನಗರ', search: 'ಉದ್ಯೋಗ ಹುಡುಕಿ', latest: 'ಹೊಸ ಉದ್ಯೋಗಗಳು', browse: 'ವಲಯದ ಪ್ರಕಾರ', match: 'ಹೊಂದಾಣಿಕೆ', apply: 'ಅರ್ಜಿ ಸಲ್ಲಿಸಿ', save: 'ಉಳಿಸಿ', saved: 'ಉಳಿಸಲಾಗಿದೆ',
    profile: 'ಪ್ರೊಫೈಲ್', applications: 'ಅರ್ಜಿಗಳು', savedJobs: 'ಉಳಿಸಿದ ಉದ್ಯೋಗಗಳು', alerts: 'ಉದ್ಯೋಗ ಎಚ್ಚರಿಕೆ', notifications: 'ಅಧಿಸೂಚನೆಗಳು', settings: 'ಸೆಟ್ಟಿಂಗ್ಸ್', recommended: 'ನಿಮಗಾಗಿ ಶಿಫಾರಸು', skip: 'ವಿಷಯಕ್ಕೆ ಹೋಗಿ' },
};
export const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['kn', 'ಕನ್ನಡ']];
const Ctx = createContext(null);
export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('ss_lang') || 'en'; } catch { return 'en'; } });
  useEffect(() => { document.documentElement.lang = lang; try { localStorage.setItem('ss_lang', lang); } catch { /* ignore */ } }, [lang]);
  const t = (k) => S[lang]?.[k] ?? S.en[k] ?? k;
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);
