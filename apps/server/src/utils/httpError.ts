/**
 * Erreur portant un code HTTP, consommée par le pattern try/catch des
 * contrôleurs (`err.statusCode || 500`). Source unique — importée par
 * domain.service et classifier.service.
 */
export function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}
