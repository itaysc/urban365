import { Logger } from '@nestjs/common';

/**
 * Fails fast on the misconfigurations that are silent in production: a guessable JWT
 * secret, and CORS left open while cookies are credentialed.
 */
export function assertBootConfig(config: {
  nodeEnv: string;
  jwtSecret: string;
  corsOrigins: string[];
}): void {
  const isProduction = config.nodeEnv === 'production';
  const problems: string[] = [];

  // Rough entropy: distinct characters against length. Enough to catch "secret" and
  // "changeme" without pretending to be a real estimator.
  const distinct = new Set(config.jwtSecret).size;
  if (config.jwtSecret.length < 32 || distinct < 12) {
    problems.push('JWT_SECRET is too short or too predictable (want 32+ random characters)');
  }

  if (config.corsOrigins.includes('*')) {
    problems.push('CORS_ORIGINS contains "*", which cannot be used with credentialed cookies');
  }

  if (problems.length === 0) return;

  const message = `Insecure configuration:\n  - ${problems.join('\n  - ')}`;
  if (isProduction) throw new Error(message);
  Logger.warn(`${message}\n  (fatal in production)`, 'BootConfig');
}
