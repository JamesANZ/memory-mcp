import assert from "node:assert/strict";
import { countContextWords } from "../src/words.ts";

assert.equal(countContextWords([]), 0);
assert.equal(countContextWords(["one two", "three"]), 3);
assert.equal(countContextWords(["one two", "three"]) + 1, 4);

const messages = ["alpha beta", "gamma"];
const archived = messages.slice(0, 1);
const remaining = messages.slice(archived.length);
assert.equal(
  countContextWords(remaining),
  countContextWords(messages) - countContextWords(archived),
);

console.log("context words ok");
