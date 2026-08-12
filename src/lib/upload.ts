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

/** Avancement d'un envoi, tel que le navigateur le rapporte. */
export interface UploadProgress {
  /** Octets déjà partis. */
  loaded: number;
  /** Taille annoncée, ou 0 quand le navigateur ne la connaît pas. */
  total: number;
  /** Fraction de 0 à 1, ou `null` si la taille est inconnue. */
  ratio: number | null;
}

export interface PutOptions {
  /** Appelé au fil de l'envoi. */
  onProgress?: (progress: UploadProgress) => void;
  /** Pour interrompre un envoi en cours. */
  signal?: AbortSignal;
}

/**
 * Dépose le fichier sur l'URL signée. `presignUpload` fige `ContentLength` et
 * `ContentType` dans la signature : envoyer autre chose que le fichier annoncé
 * fait échouer la requête côté R2, ce qui est exactement voulu.
 *
 * `XMLHttpRequest` et non `fetch`, à dessein : **`fetch` ne sait pas rapporter
 * la progression d'un corps sortant.** Il n'expose que la lecture de la
 * réponse, ce qui ne dit rien de l'envoi. Une vidéo monte jusqu'à 2 Go ici — la
 * laisser derrière un spinner indéterminé pendant plusieurs minutes, sans dire
 * où elle en est ni si elle avance encore, est la pire attente du produit.
 *
 * Aucun délai d'abandon : le plafond de vingt secondes de `lib/client.ts` vaut
 * pour des appels d'API, pas pour un gros fichier sur un réseau lent. C'est
 * `signal` qui donne la main à l'appelant, s'il veut l'offrir.
 */
export function putToPresignedUrl(
  uploadUrl: string,
  file: File,
  { onProgress, signal }: PutOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Téléversement annulé.", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("content-type", file.type);

    xhr.upload.addEventListener("progress", (event) => {
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        ratio: event.lengthComputable && event.total > 0 ? event.loaded / event.total : null,
      });
    });

    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });

    xhr.addEventListener("load", () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("UPLOAD_FAILED"));
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("UPLOAD_FAILED"));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Téléversement annulé.", "AbortError"));
    });

    xhr.send(file);
  });
}
