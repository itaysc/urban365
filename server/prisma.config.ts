import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer reads the connection url from schema.prisma: migrate and
// introspect take it from here, while the runtime client gets it through the
// pg driver adapter in PrismaService.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
