/**
 * O driver `pg` já devolve colunas JSON/JSONB como objeto. Em alguns caminhos
 * (texto legado, `::text` no SQL) o valor chega como string. Esta função aceita
 * os dois casos e nunca lança.
 */
export function readJson<T = Record<string, unknown>>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as T) : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value as T;
  return null;
}
