export type ContentLocaleKey = "en" | "zh";

export type LocalizedByLocale<T> = Partial<Record<ContentLocaleKey, T>>;
