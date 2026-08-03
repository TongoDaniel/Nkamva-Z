// ==========================================================================
// Téléversement direct vers R2 depuis le navigateur
// ==========================================================================
// Décision 10 — l'upload va toujours en direct vers le stockage, jamais à
// travers un proxy backend. Le serveur ne délivre qu'une URL signée ; ces
// deux primitives sont ce qu'il reste à faire côté client.
// ==========================================================================

/** Repli de `presignUpload()` quand R2 n'est pas configuré (dev sans clés). */
export const PLACEHOLDER_UPLOAD_PREFIX = "data:placeholder-upload/";

/**
 * Empreinte SHA-256 du fichier, en hexadécimal minuscule — le format attendu
 * par les routes de présignature, qui l'enregistrent avec la clé délivrée.
 *
 * `crypto.subtle` exige un contexte sécurisé : disponible en HTTPS et sur
 * localhost, absent d'une page servie en HTTP simple sur une IP de réseau
 * local. L'appelant doit donc traiter l'échec, pas le supposer impossible.
 */
export async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("SUBTLE_CRYPTO_UNAVAILABLE");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Dépose le fichier sur l'URL signée. `presignUpload` fige `ContentLength` et
 * `ContentType` dans la signature : envoyer autre chose que le fichier annoncé
 * fait échouer la requête côté R2, ce qui est exactement voulu.
 */
export async function putToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("UPLOAD_FAILED");
}
