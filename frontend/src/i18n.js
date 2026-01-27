import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import tr from './locales/tr.json';

// Get saved language or detect from browser
const savedLang = localStorage.getItem('language');
const browserLang = navigator.language.split('-')[0];
const defaultLang = savedLang || (browserLang === 'tr' ? 'tr' : 'en');

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        tr: { translation: tr }
    },
    lng: defaultLang,
    fallbackLng: 'en',
    interpolation: {
        escapeValue: false
    }
});

// Persist language changes
i18n.on('languageChanged', (lng) => {
    localStorage.setItem('language', lng);
});

export default i18n;
