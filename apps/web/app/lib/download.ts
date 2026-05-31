export function filenameFromContentDisposition(
  header: string | null,
  fallback: string,
) {
  if (!header) {
    return fallback;
  }

  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return encodedMatch[1].trim().replace(/^"|"$/g, '') || fallback;
    }
  }

  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1]?.trim() || fallback;
}

export async function downloadResponseBody(
  response: Response,
  fallbackFilename: string,
) {
  const blob = await response.blob();
  const filename = filenameFromContentDisposition(
    response.headers.get('content-disposition'),
    fallbackFilename,
  );
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
