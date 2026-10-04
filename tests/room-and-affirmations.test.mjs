import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function importBrowserModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const encoded = Buffer.from(source).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const [{ buildRoomDescriptionPlan }, { getDailyAffirmation }] = await Promise.all([
  importBrowserModule("../public/room-plan.js"),
  importBrowserModule("../public/affirmations.js")
]);

test("room description plans reflect archetypes and fit the daily time budget", () => {
  const description = "My small bedroom has a desk, limited storage, and feels dim in the evening.";
  const plan = buildRoomDescriptionPlan("The Gentle Healer", description, 15);

  assert.equal(plan.archetypeName, "The Gentle Healer");
  assert.match(plan.observations.join(" "), /restorative space/i);
  assert.match(plan.observations.join(" "), /storage/i);
  assert.match(plan.disclaimer, /not a camera assessment/i);
  assert.ok(plan.steps.length > 0);
  assert.ok(plan.schedule.length <= 21);
  assert.equal(plan.schedule.flatMap(day => day.tasks).length, plan.steps.length);
  assert.ok(plan.schedule.every(day => day.minutes <= 15));
  assert.ok(plan.schedule.every(day =>
    day.tasks.reduce((total, task) => total + task.minutes, 0) === day.minutes
  ));

  for (const day of plan.schedule) {
    for (const task of day.tasks) {
      assert.ok(task.minutes > 0 && task.minutes <= 15);
      assert.equal(plan.steps[task.stepIndex].title, task.title);
    }
  }

  assert.equal(JSON.stringify(plan).includes(description), false);
});

test("room description plans validate required inputs and limits", () => {
  assert.throws(() => buildRoomDescriptionPlan("", "A bedroom with a desk and a window.", 30), /archetype/i);
  assert.throws(() => buildRoomDescriptionPlan("The Dreamer", "Too short", 30), /at least 20 characters/i);
  assert.throws(() => buildRoomDescriptionPlan("The Dreamer", "A bedroom with a desk and a window.", 4), /5 to 480/i);
  assert.throws(() => buildRoomDescriptionPlan("The Dreamer", "A".repeat(2001), 30), /up to 2000/i);

  const minimumTimePlan = buildRoomDescriptionPlan(
    "The Curious Wanderer",
    "My bedroom has a desk for study and needs more storage.",
    5
  );
  assert.ok(minimumTimePlan.schedule.length <= 21);
  assert.ok(minimumTimePlan.schedule.every(day => day.minutes <= 5));
});

test("daily affirmations are stable per UTC day and distinct across the year", () => {
  const firstDay = Date.UTC(2026, 0, 1);
  const affirmation = getDailyAffirmation(
    "test-member",
    "🌿 The Gentle Healer",
    new Date(firstDay)
  );
  assert.equal(
    getDailyAffirmation("test-member", "🌿 The Gentle Healer", new Date(firstDay)),
    affirmation
  );

  const year = Array.from({ length: 365 }, (_, day) => getDailyAffirmation(
    "test-member",
    "🌿 The Gentle Healer",
    new Date(firstDay + day * 24 * 60 * 60 * 1000)
  ));
  assert.equal(new Set(year).size, 365);
});

test("room plans remain readable and writable only by their owner", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const roomPlanRule = rules.match(/match \/roomPlans\/\{planId\} \{([\s\S]*?)\n      \}/)?.[1];
  assert.ok(roomPlanRule, "roomPlans rules should exist under users/{uid}");
  assert.match(roomPlanRule, /allow read: if isSelf\(uid\)/);
  assert.match(roomPlanRule, /allow create: if isSelf\(uid\)/);
  assert.match(roomPlanRule, /allow update: if isSelf\(uid\)/);
  assert.match(roomPlanRule, /allow delete: if isSelf\(uid\)/);
  assert.doesNotMatch(roomPlanRule, /fitScore|roomDescription|imageBase64/);
  assert.match(roomPlanRule, /'archetypeName', 'dailyMinutes', 'observations'/);
});
