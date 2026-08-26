// lib/prisma.ts
import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Serverless, not a long-running server: every concurrent Vercel function
// instance gets its own separate Pool, not a shared one. node-postgres
// defaults to 10 connections per Pool -- fine for a single traditional
// server process, but a handful of concurrent invocations each opening up
// to 10 of their own adds up fast against Prisma Postgres's connection
// ceiling. Once that's exhausted, Prisma's own gateway starts rejecting new
// connections with "Failed to connect to upstream database" -- which reads
// like a Prisma-side outage but is actually us, from our own load. Capping
// this small per-instance (the platform's concurrency, not this number, is
// what handles simultaneous requests) is the standard fix for node-postgres
// in a serverless environment.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
