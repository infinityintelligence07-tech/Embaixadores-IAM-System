import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/** Valida um parâmetro UUID e responde em português quando o id é inválido. */
export function uuidPipe(message = 'Identificador inválido.'): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException(message),
  });
}
