/** Lato massimo della foto salvata: basta per l'avatar e per il coach in campo. */
export const PHOTO_SIZE = 320;

/** Ritaglio quadrato centrato e JPEG compresso, pronto per l'API. */
export async function resizePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/"))
    throw new Error("Scegli un'immagine (JPG, PNG o simili).");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Non riusciamo a leggere questa immagine. Provane un'altra.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const target = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Il tuo browser non riesce a preparare la foto.");
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    target,
    target,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
