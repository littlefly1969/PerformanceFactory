import { API_BASE, secureFetch } from "@/app/lib/api";

/** Chiamata admin JSON: restituisce i dati o lancia il messaggio dell'API. */
export async function adminRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await secureFetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(". ")
        : (data.message ?? "Operazione non riuscita."),
    );
  return data as T;
}
