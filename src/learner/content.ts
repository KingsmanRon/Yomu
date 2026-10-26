import type {
  Catalog,
  CompiledAppLines,
  CompiledAssessment,
  CompiledClipLibrary,
  CompiledLesson,
  Lang,
} from "@/lib/content/compiled";

/**
 * Loads compiled content. Requests go through the service worker, which
 * serves precached and downloaded files offline. Results are kept in memory
 * for the session.
 */
const memo = new Map<string, Promise<unknown>>();

export class ContentUnavailableError extends Error {
  constructor(public url: string) {
    super(`content unavailable: ${url}`);
  }
}

function getJson<T>(url: string): Promise<T> {
  let p = memo.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new ContentUnavailableError(url);
        return res.json() as Promise<T>;
      })
      .catch((e) => {
        memo.delete(url);
        throw e instanceof ContentUnavailableError ? e : new ContentUnavailableError(url);
      });
    memo.set(url, p);
  }
  return p;
}

export const loadCatalog = () => getJson<Catalog>("/content/catalog.json");
export const loadAppLines = (lang: Lang) => getJson<CompiledAppLines>(`/content/app.${lang}.json`);
export const loadClips = (lang: Lang) => getJson<CompiledClipLibrary>(`/content/clips.${lang}.json`);
export const loadAssessment = (lang: Lang) => getJson<CompiledAssessment>(`/content/assessment.${lang}.json`);
export const loadLesson = (lang: Lang, id: string) => getJson<CompiledLesson>(`/content/lessons/${lang}/${id}.json`);
export const lessonUrl = (lang: Lang, id: string) => `/content/lessons/${lang}/${id}.json`;

export function forgetContentCache(): void {
  memo.clear();
}
