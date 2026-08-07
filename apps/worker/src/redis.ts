import IORedis from "ioredis";

/**
 * BullMQ exige maxRetriesPerRequest: null en la conexión que usan Worker/QueueEvents,
 * de lo contrario lanza en tiempo de ejecución. Se comparte una sola conexión para
 * todos los workers de este proceso.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}
