window.SAMPLE_MATCH = {
 "match": "r1-m46",
 "round": 1,
 "a": {
  "id": "a027",
  "card": {
   "reasoning": "probabilistic",
   "workflow": "test-first",
   "strategy": "maximal-rigour"
  },
  "cardNames": {
   "reasoning": "Probabilistic",
   "workflow": "Test first",
   "strategy": "Maximal rigour"
  },
  "taken": [
   {
    "n": 1,
    "tier": "MAJOR",
    "title": "No audience signal",
    "stance": "CONCEDE",
    "answer": "Right. Fixed: no audience signal."
   },
   {
    "n": 2,
    "tier": "FATAL",
    "title": "No call to action",
    "stance": "CONCEDE",
    "answer": "Right. Fixed: no call to action."
   },
   {
    "n": 3,
    "tier": "MINOR",
    "title": "Never mentions the three plans",
    "stance": "REBUT",
    "answer": "Wrong. The task never asks for that; see the second line of the task."
   },
   {
    "n": 4,
    "tier": "FATAL",
    "title": "Reads as cute, not playful",
    "stance": "CONCEDE",
    "answer": "Right. Fixed: reads as cute, not playful."
   }
  ]
 },
 "b": {
  "id": "a038",
  "card": {
   "reasoning": "expert-panel",
   "workflow": "draft-critique-rewrite",
   "strategy": "concrete-specifics"
  },
  "cardNames": {
   "reasoning": "Expert panel",
   "workflow": "Draft, critique, rewrite",
   "strategy": "Concrete specifics"
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
    "tier": "FATAL",
    "title": "Never mentions the three plans",
    "stance": "CONCEDE",
    "answer": "Right. Fixed: never mentions the three plans."
   }
  ]
 },
 "winner": "a027",
 "loser": "a038",
 "reason": "a027 named all three plans and kept the headline under ten words.",
 "totals": {
  "a027": 80.0,
  "a038": 60.5
 },
 "survived": [
  "No audience signal",
  "No call to action",
  "Reads as cute, not playful"
 ],
 "scores": {
  "a027": {
   "correctness": 7,
   "completeness": 9,
   "specificity": 9,
   "robustness": 7,
   "clarity": 9,
   "fatal": false
  },
  "a038": {
   "correctness": 7,
   "completeness": 7,
   "specificity": 6,
   "robustness": 3,
   "clarity": 7,
   "fatal": false
  }
 },
 "standing": {
  "a027": [
   "Never mentions the three plans"
  ],
  "a038": [
   "Price math is off"
  ]
 }
};
