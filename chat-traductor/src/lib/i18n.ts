import type { Lang } from './types'

/**
 * Interfaz bilingüe. Sobria, sin disculpas ni exclamaciones.
 * El idioma de la interfaz es `profiles.lang` del usuario que mira.
 */
const strings = {
  es: {
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

    noFreeSlots: 'No quedan plazas libres en esta sala.',
    claimHint: 'Se guarda en este dispositivo. No hace falta contraseña ni correo.',
    notifyOn: 'Avisos activados',
    notifyOff: 'Activar avisos',
    notifyDenied: 'Avisos bloqueados en el navegador',
    notifyInstall: 'Instala la app para recibir avisos',
    yourName: 'Tu nombre',
  },
  bg: {
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

    noFreeSlots: 'В тази стая няма свободни места.',
    claimHint: 'Запазва се на това устройство. Не е нужна парола или имейл.',
    notifyOn: 'Известията са включени',
    notifyOff: 'Включи известията',
    notifyDenied: 'Известията са блокирани в браузъра',
    notifyInstall: 'Инсталирай приложението, за да получаваш известия',
    yourName: 'Твоето име',
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
