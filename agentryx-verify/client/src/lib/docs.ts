/** Any link to a library file (/api/pm/documents/:id/file#page=3) → the in-portal viewer (/docs/:id#page=3). */
export const docHref = (url: string) => url.replace(/^\/api\/pm\/documents\/([\w-]+)\/file/, "/docs/$1");
export const isInternal = (url: string) => url.startsWith("/");
