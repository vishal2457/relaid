import assert from "node:assert/strict";
import test from "node:test";
import { flattenOpencodeModels, uniqueModels } from "./model-catalog.js";

test("OpenCode model IDs include their provider namespace", () => {
  const models = flattenOpencodeModels([
    { id: "openai", models: { "gpt-test": { id: "gpt-test" } } },
    { id: "anthropic", models: { "claude-test": { id: "claude-test" } } },
  ]);
  assert.deepEqual(models, ["anthropic/claude-test", "openai/gpt-test"]);
});

test("model catalogs are de-duplicated and empty values are removed", () => {
  assert.deepEqual(uniqueModels([" beta ", "alpha", "beta", ""]), ["alpha", "beta"]);
});
