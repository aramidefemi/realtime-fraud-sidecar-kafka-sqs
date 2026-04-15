export const queueNames = {
  intake: "fraud-intake-queue",
  enrichment: "enrichment-queue",
  scoring: "scoring-queue",
  decision: "decision-queue",
  enrichmentDlq: "enrichment-dlq",
  scoringDlq: "scoring-dlq",
};

export const withDlq = [
  { queue: queueNames.enrichment, dlq: queueNames.enrichmentDlq },
  { queue: queueNames.scoring, dlq: queueNames.scoringDlq },
];
