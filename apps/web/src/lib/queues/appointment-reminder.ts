import "server-only";
import { Queue } from "bullmq";
import { APPOINTMENT_REMINDER_QUEUE } from "@reto-whatsapp/core";
import { getQueueConnection } from "./connection";

let queue: Queue | undefined;

function getAppointmentReminderQueue(): Queue {
  queue ??= new Queue(APPOINTMENT_REMINDER_QUEUE, { connection: getQueueConnection() });
  return queue;
}

/**
 * Encola el procesamiento de un recordatorio de cita ya guardado en
 * `appointment_reminder_events`. `jobId = eventId` evita duplicar el job si el
 * receptor se reintenta (p. ej. salon-pro reintenta por timeout).
 */
export async function enqueueAppointmentReminder(eventId: string): Promise<void> {
  await getAppointmentReminderQueue().add(
    "process",
    { eventId },
    { jobId: eventId, attempts: 5, backoff: { type: "exponential", delay: 2000 } },
  );
}
