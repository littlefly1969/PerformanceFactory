export const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "-";

export const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as {
      message?: string;
      error?: string;
    };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};
