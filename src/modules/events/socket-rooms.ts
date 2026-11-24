/** Salas do socket. Tudo que é da loja vai para `store:<id>`; nada de broadcast global. */
export const storeRoom = (storeId: string) => `store:${storeId}`;
/** Vitrine pública da loja: só recebe aviso de catálogo, sem dado. */
export const catalogRoom = (storeId: string) => `catalog:${storeId}`;
/** Sala do agente de impressão (nome mantido por compatibilidade com o print-lojapod). */
export const printRoom = (storeId: string) => `loja_${storeId}`;
