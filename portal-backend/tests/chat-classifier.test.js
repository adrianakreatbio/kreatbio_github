import assert from "node:assert/strict";
import test from "node:test";
import { classifyChatQuestion } from "../chat-classifier.js";

test("accepts short bioinformatics tool and QC questions", () => {
  assert.equal(classifyChatQuestion("fastp is?"), "report");
  assert.equal(classifyChatQuestion("what is fastp"), "report");
  assert.equal(classifyChatQuestion("is fastp in this report and what is it exactly?"), "report");
  assert.equal(classifyChatQuestion("adapter trimming"), "report");
  assert.equal(classifyChatQuestion("quality control"), "report");
  assert.equal(classifyChatQuestion("what does DADA2 do?"), "report");
});

test("uses web mode for current bioinformatics information", () => {
  assert.equal(classifyChatQuestion("What is the latest fastp version?"), "web");
  assert.equal(classifyChatQuestion("Find the current DADA2 documentation"), "web");
  assert.equal(classifyChatQuestion("give me the official website link to download the SILVA classifier"), "web");
});

test("keeps report-linked research questions in mixed mode", () => {
  assert.equal(classifyChatQuestion("Could published research explain this microbiome result?"), "mixed");
});

test("allows ambiguous follow-ups while declining clearly unrelated topics", () => {
  const history = [{ role: "user", text: "What is fastp?" }];
  assert.equal(classifyChatQuestion("How does it work?", history), "report");
  assert.equal(classifyChatQuestion("What is the football score?", history), "out_of_scope");
  assert.equal(classifyChatQuestion("What is tomorrow's weather?"), "out_of_scope");
});
