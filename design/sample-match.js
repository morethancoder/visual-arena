window.SAMPLE_MATCH = {
 "match": "r1-m08",
 "round": 1,
 "a": {
  "id": "a088",
  "card": {
   "reasoning": "probabilistic",
   "workflow": "options-matrix",
   "strategy": "edge-cases-first"
  },
  "cardNames": {
   "reasoning": "Probabilistic",
   "workflow": "Options matrix",
   "strategy": "Edge cases first"
  },
  "taken": [
   {
    "n": 1,
    "tier": "FATAL",
    "title": "No call to action",
    "stance": "CONCEDE",
    "answer": "Right. Fixed: no call to action."
   },
   {
    "n": 2,
    "tier": "MINOR",
    "title": "Price math is off",
    "stance": "REBUT",
    "answer": "Wrong. The task never asks for that; see the second line of the task."
   },
   {
    "n": 3,
    "tier": "FATAL",
    "title": "Generic SaaS phrasing",
    "stance": "REBUT",
    "answer": "Wrong. The task never asks for that; see the second line of the task."
   }
  ]
 },
 "b": {
  "id": "a006",
  "card": {
   "reasoning": "constraint-first",
   "workflow": "outline-first",
   "strategy": "simplest"
  },
  "cardNames": {
   "reasoning": "Constraint first",
   "workflow": "Outline first",
   "strategy": "Simplest thing that works"
  },
  "taken": [
   {
    "n": 1,
    "tier": "MAJOR",
    "title": "Price math is off",
    "stance": "REBUT",
    "answer": "Wrong. The task never asks for that; see the second line of the task."
   },
   {
    "n": 2,
    "tier": "MINOR",
    "title": "No call to action",
    "stance": "REBUT",
    "answer": "Wrong. The task never asks for that; see the second line of the task."
   },
   {
    "n": 3,
    "tier": "MAJOR",
    "title": "Never mentions the three plans",
    "stance": "CONCEDE",
    "answer": "Right. Fixed: never mentions the three plans."
   }
  ]
 },
 "winner": "a006",
 "loser": "a088",
 "reason": "a006 fixed every attack it conceded; the other left a fatal miscount standing.",
 "totals": {
  "a088": 79.5,
  "a006": 81.0
 },
 "scores": {
  "a088": {
   "correctness": 8,
   "completeness": 10,
   "specificity": 7,
   "robustness": 6,
   "clarity": 8,
   "fatal": true
  },
  "a006": {
   "correctness": 8,
   "completeness": 9,
   "specificity": 9,
   "robustness": 7,
   "clarity": 7,
   "fatal": false
  }
 },
 "standing": {
  "a088": [
   "Generic SaaS phrasing"
  ],
  "a006": []
 }
};
