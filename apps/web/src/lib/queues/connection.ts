import "server-only";
import IORedis from "ioredis";

let connection: IORedis | undefined;

/**
 * Conexión Redis compartida para producir jobs de BullMQ desde el servidor web.
 * `maxRetriesPerRequest: null` es requerido por BullMQ para Worker/QueueEvents;
 * se mantiene aquí también por consistencia con apps/worker.
 */
export function getQueueConnection(): IORedis {
  connection ??= new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  return connection;
}
