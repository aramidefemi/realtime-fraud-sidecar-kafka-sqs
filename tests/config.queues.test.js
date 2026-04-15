import test from "node:test";
import assert from "node:assert/strict";

import { queueNames, withDlq } from "../src/config/queues.js";

test("DLQ mapping only applies to enrichment and scoring queues", () => {
  assert.deepEqual(withDlq, [
    { queue: queueNames.enrichment, dlq: queueNames.enrichmentDlq },
    { queue: queueNames.scoring, dlq: queueNames.scoringDlq },
  ]);
});
