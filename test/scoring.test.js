import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore, recordFirstAnswer } from "../src/scoring.js";

test("only the first answer changes the score", () => {
  let answers = {};
  answers = recordFirstAnswer(answers, "q1", 0, 1);
  answers = recordFirstAnswer(answers, "q1", 1, 1);
  answers = recordFirstAnswer(answers, "q2", 2, 2);

  assert.deepEqual(answers.q1, { selectedIndex: 0, correct: false });
  assert.deepEqual(calculateScore(answers, 2), { correct: 1, total: 2, percent: 50 });
});
