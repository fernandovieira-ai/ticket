/**
 * Sanitiza texto removendo caracteres especiais para compatibilidade com LATIN1
 * Mantém a legibilidade convertendo acentos e símbolos para equivalentes ASCII
 */
export function sanitizeText(text: string): string {
  if (!text) return text;

  return text
    // Substitui caracteres especiais comuns por equivalentes ASCII
    .replace(/[""]/g, '"')           // Aspas curvas -> aspas normais
    .replace(/['']/g, "'")           // Apóstrofes curvos -> apóstrofe normal
    .replace(/[–—]/g, "-")           // Travessões -> hífen
    .replace(/→/g, "->")             // Seta -> seta ASCII
    .replace(/←/g, "<-")             // Seta esquerda -> seta ASCII
    .replace(/…/g, "...")            // Reticências -> três pontos
    .replace(/º/g, "o")              // Símbolo masculino -> o
    .replace(/ª/g, "a")              // Símbolo feminino -> a
    .replace(/°/g, "o")              // Graus -> o
    .replace(/©/g, "(c)")            // Copyright -> (c)
    .replace(/®/g, "(R)")            // Marca registrada -> (R)
    .replace(/™/g, "(TM)")           // Trademark -> (TM)
    .replace(/§/g, "par.")           // Parágrafo -> par.
    // Remove acentos mantendo as letras
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")           // Remove diacríticos (acentos)
    .replace(/[^\x00-\x7F]/g, "?");  // Substitui caracteres restantes por ?
}