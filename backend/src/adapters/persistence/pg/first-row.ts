import { NotFoundException } from '@nestjs/common';
import { QueryResult, QueryResultRow } from 'pg';

/**
 * Devolve a primeira linha de um UPDATE/INSERT ... RETURNING ou lança 404
 * com mensagem em português, em vez de um TypeError genérico.
 */
export function firstRowOrThrow<T extends QueryResultRow = any>(
  result: QueryResult<T>,
  message = 'Registro não encontrado.',
): T {
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundException(message);
  }
  return row;
}
