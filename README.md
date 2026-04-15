# Kafka -> SQS Fraud Detection Sidecar

## Data Flow

1. Payment events are produced to Kafka topic `payment_attempt` by `src/scripts/send-sample-events.js`.
2. `bridge-service` (`src/services/bridge-service.js`) consumes Kafka and forwards valid messages to SQS `fraud-intake-queue`.
3. `intake-worker` (`src/services/intake-worker.js`) validates and applies idempotency checks (`src/lib/idempotency-store.js`), then publishes enrichment jobs to `enrichment-queue`.
4. `enrichment-worker` (`src/services/enrichment-worker.js`) calls vendor adapters in `src/domain/vendors.js` and sends normalized output to `scoring-queue`.
5. `scoring-worker` (`src/services/scoring-worker.js`) calculates risk/decision using `src/domain/scoring.js` and publishes decision events to `decision-queue`.
6. `decision-publisher` (`src/services/decision-publisher.js`) consumes and emits final decision logs/events.
7. Failed messages are retried via SQS redrive policy configured in `src/scripts/bootstrap-queues.js` and isolated in DLQs.

## Scalability

This architecture scales by separating stages with queues, so each worker fleet (`intake`, `enrichment`, `scoring`) can scale independently based on its own load. Kafka absorbs upstream event spikes, SQS smooths downstream pressure, and DLQs isolate failures without blocking the rest of the pipeline.

