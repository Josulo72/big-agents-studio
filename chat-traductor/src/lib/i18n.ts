import type { Lang } from './types'

/**
 * Interfaz bilingüe. Sobria, sin disculpas ni exclamaciones.
 * El idioma de la interfaz es `profiles.lang` del usuario que mira.
 */
const strings = {
  es: {
    signInTitle: 'Acceso',
    signInHint: 'Te enviamos un enlace de un solo uso.',
    emailLabel: 'Correo',
    sendLink: 'Enviar enlace',
    sending: 'Enviando…',
    linkSent: 'Enlace enviado. Revisa el correo.',
    signOut: 'Salir',

    profileTitle: 'Tu perfil',
    profileHint: 'Solo se pide una vez.',
    displayName: 'Nombre',
    language: 'Idioma',
    spanish: 'Español',
    bulgarian: 'Búlgaro',
    save: 'Guardar',
    saving: 'Guardando…',

    noRoom: 'No perteneces a ninguna sala.',
    loading: 'Cargando…',
    noMessages: 'Sin mensajes todavía.',
    loadOlder: 'Cargar anteriores',
    historyStart: 'Principio de la conversación',

    translating: 'Traduciendo…',
    failed: 'No se pudo traducir',
    notSent: 'No se pudo enviar',
    retry: 'Reintentar',
    showOriginal: 'Ver original',
    hideOriginal: 'Ocultar original',
    original: 'Original',

    placeholder: 'Escribe…',
    send: 'Enviar',
    typing: (name: string) => `${name} está escribiendo…`,

    offline: 'Sin conexión',
    reconnecting: 'Reconectando…',
    today: 'Hoy',
    yesterday: 'Ayer',
    newMessages: 'Mensajes nuevos',

    noFreeSlots: 'No quedan plazas libres en esta sala.',
    claimHint: 'Se guarda en este dispositivo. No hace falta contraseña ni correo.',
    notifyOn: 'Avisos activados',
    notifyOff: 'Activar avisos',
    notifyDenied: 'Avisos bloqueados en el navegador',
    notifyInstall: 'Instala la app para recibir avisos',
    newMessage: 'Mensaje nuevo',
  },
  bg: {
    signInTitle: 'Вход',
    signInHint: 'Изпращаме ти еднократна връзка.',
    emailLabel: 'Имейл',
    sendLink: 'Изпрати връзка',
    sending: 'Изпраща се…',
    linkSent: 'Връзката е изпратена. Провери имейла.',
    signOut: 'Изход',

    profileTitle: 'Твоят профил',
    profileHint: 'Пита се само веднъж.',
    displayName: 'Име',
    language: 'Език',
    spanish: 'Испански',
    bulgarian: 'Български',
    save: 'Запази',
    saving: 'Запазва се…',

    noRoom: 'Не си член на стая.',
    loading: 'Зарежда се…',
    noMessages: 'Още няма съобщения.',
    loadOlder: 'Зареди по-стари',
    historyStart: 'Начало на разговора',

    translating: 'Превежда се…',
    failed: 'Преводът не бе успешен',
    notSent: 'Съобщението не бе изпратено',
    retry: 'Опитай отново',
    showOriginal: 'Виж оригинала',
    hideOriginal: 'Скрий оригинала',
    original: 'Оригинал',

    placeholder: 'Напиши…',
    send: 'Изпрати',
    typing: (name: string) => `${name} пише…`,

    offline: 'Няма връзка',
    reconnecting: 'Свързва се…',
    today: 'Днес',
    yesterday: 'Вчера',
    newMessages: 'Нови съобщения',

    noFreeSlots: 'В тази стая няма свободни места.',
    claimHint: 'Запазва се на това устройство. Не е нужна парола или имейл.',
    notifyOn: 'Известията са включени',
    notifyOff: 'Включи известията',
    notifyDenied: 'Известията са блокирани в браузъра',
    notifyInstall: 'Инсталирай приложението, за да получаваш известия',
    newMessage: 'Ново съобщение',
  },
} as const

export type Strings = (typeof strings)['es']

export function t(lang: Lang): Strings {
  return strings[lang] as Strings
}

/** Etiqueta corta del idioma, en su propio alfabeto. */
export const langLabel: Record<Lang, string> = {
  es: 'ES',
  bg: 'БГ',
}

export const localeOf: Record<Lang, string> = {
  es: 'es-ES',
  bg: 'bg-BG',
}
