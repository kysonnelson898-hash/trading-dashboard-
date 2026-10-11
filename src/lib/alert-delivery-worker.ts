import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

const MAX_BATCH_SIZE = 25;
const MAX_RETRY_DELAY_SECONDS = 3600;

interface ClaimedAlert {
  id: string;
  message: string;
  attempts: number;
}

interface ClaimResult {
  rows: ClaimedAlert[];
}

export interface AlertDeliverySummary {
  claimed: number;
  sent: number;
  failed: number;
}

async function claimPendingAlerts(
  batchSize: number,
): Promise<ClaimedAlert[]> {
  const result = await db.query<ClaimedAlert>(
    `
      WITH candidates AS (
        SELECT id
        FROM public.market_alerts
        WHERE
          (
            delivery_status IN ('pending', 'failed')
            AND next_attempt_at <= NOW()
          )
          OR
          (
            delivery_status = 'sending'
            AND last_attempt_at < NOW() - INTERVAL '10 minutes'
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE public.market_alerts AS alerts
      SET
        delivery_status = 'sending',
        attempts = alerts.attempts + 1,
        last_attempt_at = NOW(),
        updated_at = NOW()
      FROM candidates
      WHERE alerts.id = candidates.id
      RETURNING alerts.id, alerts.message, alerts.attempts
    `,
    [batchSize],
  );

  return result.rows;
}

async function markAlertSent(id: string): Promise<void> {
  await db.query(
    `
      UPDATE public.market_alerts
      SET
        delivery_status = 'sent',
        sent_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1 AND delivery_status = 'sending'
    `,
    [id],
  );
}

async function markAlertFailed(
  id: string,
  attempts: number,
): Promise<void> {
  const delaySeconds = Math.min(
    MAX_RETRY_DELAY_SECONDS,
    30 * 2 ** Math.min(Math.max(attempts - 1, 0), 7),
  );

  await db.query(
    `
      UPDATE public.market_alerts
      SET
        delivery_status = 'failed',
        next_attempt_at = NOW() + ($2 * INTERVAL '1 second'),
        last_error = $3,
        updated_at = NOW()
      WHERE id = $1 AND delivery_status = 'sending'
    `,
    [
      id,
      delaySeconds,
      `Telegram delivery failed on attempt ${attempts}.`,
    ],
  );
}

export async function deliverQueuedMarketAlerts(
  batchSize = MAX_BATCH_SIZE,
): Promise<AlertDeliverySummary> {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_BATCH_SIZE
  ) {
    throw new Error(
      `Batch size must be an integer between 1 and ${MAX_BATCH_SIZE}.`,
    );
  }

  const claimed = await claimPendingAlerts(batchSize);

  const summary: AlertDeliverySummary = {
    claimed: claimed.length,
    sent: 0,
    failed: 0,
  };

  for (const alert of claimed) {
    try {
      const sent = await sendTelegramMessage(alert.message);

      if (sent) {
        await markAlertSent(alert.id);
        summary.sent += 1;
      } else {
        await markAlertFailed(alert.id, alert.attempts);
        summary.failed += 1;
      }
    } catch (error) {
      console.error(
        `Alert delivery failed for queued alert ${alert.id}:`,
        error,
      );

      try {
        await markAlertFailed(alert.id, alert.attempts);
      } catch (updateError) {
        console.error(
          `Unable to record delivery failure for alert ${alert.id}:`,
          updateError,
        );
      }

      summary.failed += 1;
    }
  }

  return summary;
}
