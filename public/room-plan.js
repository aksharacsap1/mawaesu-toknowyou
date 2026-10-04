const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_DAILY_MINUTES = 480;
const MAX_PLAN_DAYS = 21;

const archetypeGuidance = [
  {
    matches: /healer|keeper|ache|grief|tender|compassion|empath/,
    focus: "a gentle, restorative space with comforting textures and clear places to pause"
  },
  {
    matches: /dreamer|vision|imagin|creative|wonder/,
    focus: "a soft, imaginative space with a small area for ideas and creative expression"
  },
  {
    matches: /wanderer|searching|curious|explor|path/,
    focus: "a flexible, easy-to-navigate space with useful items visible and simple zones"
  },
  {
    matches: /fighter|flame|bravery|anger|determination|discipline/,
    focus: "a grounded, focused space with fewer distractions and a clear place to begin"
  },
  {
    matches: /spirit|joy|radiant|hope|loving|peace/,
    focus: "a welcoming, uplifting space with a few meaningful colors and personal details"
  },
  {
    matches: /survivor|fear|safety|resilien|strength/,
    focus: "a reassuring, steady space with predictable routines and a comfortable place to rest"
  }
];

function hasAny(text, pattern) {
  return pattern.test(text);
}

function makeStep(title, instructions, estimatedMinutes, materials = []) {
  return { title, instructions, estimatedMinutes, materials };
}

function scheduleSteps(steps, dailyMinutes) {
  const schedule = [];
  let day = { day: 1, minutes: 0, tasks: [] };

  for (const [stepIndex, step] of steps.entries()) {
    const minutes = Math.min(step.estimatedMinutes, dailyMinutes);
    if (day.tasks.length && day.minutes + minutes > dailyMinutes) {
      schedule.push(day);
      day = { day: schedule.length + 1, minutes: 0, tasks: [] };
    }
    day.tasks.push({ stepIndex, title: step.title, minutes });
    day.minutes += minutes;
  }
  if (day.tasks.length) schedule.push(day);
  return schedule;
}

export function buildRoomDescriptionPlan(archetypeName, roomDescription, dailyMinutes) {
  if (typeof archetypeName !== "string" || !archetypeName.trim() || archetypeName.length > 120) {
    throw new Error("Complete the self-discovery quiz first so the room plan can reflect your archetype.");
  }
  if (typeof roomDescription !== "string" ||
      roomDescription.trim().length < 20 ||
      roomDescription.trim().length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Describe your space in at least 20 characters (up to ${MAX_DESCRIPTION_LENGTH}).`);
  }
  if (!Number.isInteger(dailyMinutes) || dailyMinutes < 5 || dailyMinutes > MAX_DAILY_MINUTES) {
    throw new Error(`Choose a daily time from 5 to ${MAX_DAILY_MINUTES} minutes.`);
  }

  const description = roomDescription.trim();
  const lower = description.toLowerCase();
  const selectedGuidance = archetypeGuidance.find(item =>
    item.matches.test(archetypeName.toLowerCase())
  );
  const focus = selectedGuidance?.focus ||
    "a comfortable, considered space with practical zones for rest and everyday activities";
  const steps = [
    makeStep(
      "Choose one small starting point",
      `Begin with one corner or surface that matters most to you. Shape it toward ${focus}; there is no need to redo the whole room at once.`,
      10
    )
  ];
  const observations = [`Your ${archetypeName} plan is guided by ${focus}.`];

  if (hasAny(lower, /clutter|messy|pile|untidy|overwhelm|crowded|too much stuff/)) {
    observations.push("You mentioned visual clutter or crowding, so the plan starts with a small, contained clear-up.");
    steps.push(makeStep(
      "Clear one surface or walkway",
      "Choose the desk, bedside table, or path you use most. Put away only what belongs elsewhere; make a temporary keep, move, and let-go group if useful.",
      15,
      ["A small basket or reusable bag"]
    ));
  }
  if (hasAny(lower, /dark|dim|low light|lighting|lamp|window|sunlight|bright/)) {
    observations.push("Lighting was part of your description, so a low-effort light adjustment is included.");
    steps.push(makeStep(
      "Make one lighting adjustment",
      "During the day, open curtains if practical. For evenings, move an existing lamp to the area where you read, rest, or work; avoid changing electrical wiring.",
      10
    ));
  }
  if (hasAny(lower, /storage|small|tiny|limited space|no room|shelf|organis|organiz/)) {
    observations.push("Your notes mention storage or limited space, so the plan prioritizes using what you already have.");
    steps.push(makeStep(
      "Give one everyday item a home",
      "Pick the item that most often gets left out. Choose one existing drawer, shelf, hook, or container for it and keep that spot easy to reach.",
      15
    ));
  }
  if (hasAny(lower, /work|study|desk|focus|laptop|reading|read at/)) {
    observations.push("You described a work, study, or reading need, so the plan includes a simple focus zone.");
    steps.push(makeStep(
      "Set up a small focus zone",
      "Keep the surface you use for focused activity to the current task and one or two essentials. Put a comfortable seat and light within easy reach.",
      15
    ));
  }
  if (hasAny(lower, /sleep|bedroom|rest|relax|calm|wind down/)) {
    observations.push("Rest or sleep is one of your priorities, so a calmer transition into rest is part of the plan.");
    steps.push(makeStep(
      "Make the bed area feel ready for rest",
      "Move work materials away from the immediate bed area if possible. Keep one comforting item and the things you need at night within reach.",
      15
    ));
  }
  if (hasAny(lower, /color|colour|paint|neutral|vibrant|plain|bland/)) {
    observations.push("You mentioned color or the room's visual feel, so the plan uses a small, reversible color choice.");
    steps.push(makeStep(
      "Try one small color accent",
      "Choose a fabric, book cover, print, or other item you already own in a color that supports the mood you want. Try it in one place before buying or repainting anything.",
      10
    ));
  }
  if (hasAny(lower, /plant|nature|greenery|outside|window view/)) {
    observations.push("Nature or greenery matters to you, so the plan includes a simple connection to something natural.");
    steps.push(makeStep(
      "Add a natural detail",
      "If available, place a plant where it suits the light, or use a leaf, stone, nature image, or view as a small visual anchor. Skip plants if care or allergies make them unsuitable.",
      10
    ));
  }

  steps.push(
    makeStep(
      "Create one easy room reset",
      "Choose a short action that helps the space feel ready for tomorrow, such as returning a few items to their homes or clearing the place you use first each morning.",
      5
    )
  );

  const boundedSteps = steps.slice(0, 12).map(step => ({
    ...step,
    estimatedMinutes: Math.min(step.estimatedMinutes, dailyMinutes)
  }));
  const schedule = scheduleSteps(boundedSteps, dailyMinutes);
  if (schedule.length > MAX_PLAN_DAYS) {
    throw new Error("This plan is longer than the supported timeframe. Increase your daily time and try again.");
  }

  return {
    archetypeName: archetypeName.trim(),
    observations,
    steps: boundedSteps,
    schedule,
    disclaimer: "These are practical suggestions based on the details you chose to share, not a camera assessment or professional design, accessibility, or structural advice."
  };
}
