(() => {
  "use strict";

  const GAME_SECONDS = 75;
  const STAGE_SECONDS = 25;
  const WALK_KCAL = 1;
  const RUN_KCAL = 3;
  const MAX_EXERCISE_CREDIT = 2;
  const MAX_EXERCISE_KCAL = 260;
  const TARGET_MIN = 1600;
  const TARGET_MAX = 1800;
  const WAVE_TIMES = [0.05, 4.2, 8.35, 12.5, 16.65, 20.8];
  const EXERCISE_TIME = 10.4;
  const LANES = [25, 50, 75];

  const FOOD = {
    whiteRice: ["White rice", "1/4 plate", "carbohydrate", 200, "🍚"],
    friedKueyTeow: ["Fried kuey teow", "1 plate", "carbohydrate", 720, "🍜"],
    friedRice: ["Fried rice", "1 plate", "carbohydrate", 750, "🍛"],
    nasiLemak: ["Nasi lemak rendang", "1 plate", ["carbohydrate", "protein"], 880, "🍛"],
    rotiCanai: ["Roti canai", "with dhal", "carbohydrate", 380, "🫓"],
    sandwich: ["Wholemeal egg sandwich", "1 sandwich", ["carbohydrate", "protein"], 280, "🥪"],
    grilledChicken: ["Grilled chicken", "1 drumstick", "protein", 160, "🍗"],
    friedChicken: ["Fried chicken", "1 drumstick", "protein", 240, "🍗"],
    curryFish: ["Curry fish", "1 palm-sized piece", "protein", 250, "🐟"],
    boiledEgg: ["Boiled egg", "1 egg", "protein", 75, "🥚"],
    friedEgg: ["Fried egg", "1 egg", "protein", 120, "🍳"],
    steamedVeg: ["Steamed veg", "1/4 plate", "vegetable", 30, "🥦"],
    stirVeg: ["Stir-fried veg", "1/4 plate", "vegetable", 75, "🥕"],
    banana: ["Banana", "1 medium fruit", "fruit", 100, "🍌"],
    water: ["Plain water", "1 glass", "drink", 0, "💧"],
    icedMilo: ["Iced Milo", "1 glass", "carbohydrate", 220, "🥤"],
    sambal: ["Oily sambal", "1 tablespoon", "extra", 60, "🌶️"],
    cake: ["Chocolate cake", "1 slice", "extra", 350, "🍰"],
    chips: ["Potato chips", "1 small packet", "extra", 450, "🍟"]
  };

  const STAGES = [
    {
      name: "Breakfast",
      className: "breakfast",
      waves: [
        ["friedRice", "rotiCanai"], ["boiledEgg", "friedEgg"], ["steamedVeg", "stirVeg"],
        ["banana", "nasiLemak"], ["water", "icedMilo"], ["sandwich", "grilledChicken"]
      ]
    },
    {
      name: "Lunch",
      className: "lunch",
      waves: [
        ["friedRice", "whiteRice"], ["curryFish", "friedChicken"], ["steamedVeg", "stirVeg"],
        ["grilledChicken", "chips"], ["water", "icedMilo"], ["banana", "cake"]
      ]
    },
    {
      name: "Dinner",
      className: "dinner",
      waves: [
        ["friedKueyTeow", "rotiCanai"], ["sandwich", "whiteRice"], ["steamedVeg", "stirVeg"],
        ["curryFish", "cake"], ["banana", "chips"], ["sambal", "icedMilo"]
      ]
    }
  ];

  const EXERCISES = [
    { name: "Running", icon: "👟", kcal: 150 },
    { name: "Bicycle", icon: "🚲", kcal: 110 }
  ];

  const $ = selector => document.querySelector(selector);
  const board = $("#board");
  const itemsLayer = $("#items");
  const runner = $("#runner");
  const overlay = $("#overlay");
  const overlayIcon = $("#overlay-icon");
  const overlayKicker = $("#overlay-kicker");
  const overlayTitle = $("#overlay-title");
  const overlayCopy = $("#overlay-copy");
  const onboarding = $("#onboarding");
  const onboardingSlides = [...document.querySelectorAll(".onboarding-slide")];
  const slideDots = [...document.querySelectorAll(".slide-dots span")];
  const slideBack = $("#slide-back");
  const slideNext = $("#slide-next");
  const startButton = $("#start-button");
  const resultGrid = $("#result-grid");
  const activityNote = $("#activity-note");
  const mealFoods = $("#meal-foods");
  const feedback = $("#feedback");
  const runButton = $("#run-button");
  const pauseButton = $("#pause-button");
  const moveStatus = $("#move-status");
  const meter = $(".energy-meter");
  const energyMarker = $("#energy-marker");

  let state;
  let frameId = null;
  let lastFrame = 0;
  let touchStart = null;
  let feedbackTimer = null;
  let mealBannerTimer = null;
  let onboardingSlide = 0;

  function freshState() {
    return {
      mode: "idle",
      lane: 1,
      elapsed: 0,
      stage: 0,
      waveIndex: 0,
      exerciseSpawned: false,
      foodEnergy: 0,
      movementEnergy: 0,
      exerciseEnergy: 0,
      exerciseCount: 0,
      runSeconds: 0,
      running: false,
      hydration: false,
      balancedMeals: 0,
      assessedStages: new Set(),
      mealGroups: STAGES.map(() => new Set()),
      mealFoods: STAGES.map(() => []),
      entities: []
    };
  }

  function startGame() {
    stopLoop();
    itemsLayer.replaceChildren();
    state = freshState();
    state.mode = "playing";
    document.body.dataset.gameState = "playing";
    lastFrame = performance.now();
    overlay.classList.remove("success", "warning", "fail");
    $(".overlay-panel").scrollTop = 0;
    overlay.hidden = true;
    onboarding.hidden = true;
    overlayIcon.hidden = true;
    overlayIcon.disabled = true;
    overlayIcon.setAttribute("aria-label", "Game symbol");
    overlayKicker.hidden = true;
    overlayTitle.hidden = true;
    overlayCopy.hidden = true;
    resultGrid.hidden = true;
    activityNote.hidden = true;
    mealFoods.hidden = true;
    mealFoods.replaceChildren();
    pauseButton.disabled = false;
    setRunning(false);
    moveLane(0, true);
    setStage(0);
    updateHud();
    scheduleLoop();
  }

  function gameLoop(now) {
    if (state.mode !== "playing") return;
    const dt = Math.min((now - lastFrame) / 1000, 0.08);
    lastFrame = now;
    state.elapsed = Math.min(GAME_SECONDS, state.elapsed + dt);
    state.movementEnergy += (state.running ? RUN_KCAL : WALK_KCAL) * dt;
    if (state.running) state.runSeconds += dt;

    const stageIndex = Math.min(2, Math.floor(state.elapsed / STAGE_SECONDS));
    if (stageIndex !== state.stage) {
      assessMeal(state.stage);
      setStage(stageIndex);
    }

    const stageTime = state.elapsed - state.stage * STAGE_SECONDS;
    while (state.waveIndex < WAVE_TIMES.length && stageTime >= WAVE_TIMES[state.waveIndex]) {
      spawnFoodWave(state.stage, state.waveIndex);
      state.waveIndex += 1;
    }
    if (state.stage < EXERCISES.length && !state.exerciseSpawned && stageTime >= EXERCISE_TIME) {
      spawnExercise(state.stage);
      state.exerciseSpawned = true;
    }

    updateEntities(dt);
    updateHud();
    if (state.elapsed >= GAME_SECONDS) {
      finishGame();
      return;
    }
    scheduleLoop();
  }

  function setStage(index) {
    state.stage = index;
    state.waveIndex = 0;
    state.exerciseSpawned = false;
    board.classList.remove("breakfast", "lunch", "dinner");
    board.classList.add(STAGES[index].className);
    const mealBanner = $("#meal-banner");
    mealBanner.textContent = STAGES[index].name;
    window.clearTimeout(mealBannerTimer);
    mealBanner.classList.remove("stage-pop");
    void mealBanner.offsetWidth;
    mealBanner.classList.add("stage-pop");
    mealBannerTimer = window.setTimeout(() => mealBanner.classList.remove("stage-pop"), 1700);
  }

  function spawnFoodWave(stageIndex, waveIndex) {
    const choiceKeys = STAGES[stageIndex].waves[waveIndex];
    const lanes = shuffled([0, 1, 2]);
    choiceKeys.forEach((key, index) => spawnEntity(foodObject(key), lanes[index], "food"));
  }

  function spawnExercise(stageIndex) {
    const exercise = EXERCISES[stageIndex];
    spawnEntity({ ...exercise, serving: "Short session", group: "exercise" }, Math.floor(Math.random() * 3), "exercise");
  }

  function foodObject(key) {
    const [name, serving, group, kcal, icon] = FOOD[key];
    return { name, serving, group, kcal, icon };
  }

  function spawnEntity(item, lane, kind) {
    const node = document.createElement("div");
    node.className = `game-item ${kind}`;
    node.style.left = `${LANES[lane]}%`;
    node.innerHTML = `<span class="icon">${item.icon}</span><strong>${item.name}</strong><small>${kind === "exercise" ? `−${item.kcal} kcal` : `${item.serving} · ${item.kcal} kcal`}</small>`;
    itemsLayer.append(node);
    state.entities.push({ item, lane, kind, y: -70, resolved: false, node });
  }

  function updateEntities(dt) {
    const height = board.clientHeight;
    const targetY = height * 0.79;
    const speed = height * (state.running ? 0.23 : 0.17);
    for (const entity of state.entities) {
      entity.y += speed * dt;
      entity.node.style.transform = `translate(-50%, ${entity.y}px)`;
      if (!entity.resolved && entity.y >= targetY) {
        entity.resolved = true;
        if (entity.lane === state.lane) collect(entity);
      }
      if (entity.y > height + 110) entity.remove = true;
    }
    state.entities.filter(entity => entity.remove).forEach(entity => entity.node.remove());
    state.entities = state.entities.filter(entity => !entity.remove);
  }

  function collect(entity) {
    entity.node.classList.add("collected");
    entity.remove = true;
    if (entity.kind === "exercise") {
      if (state.exerciseCount < MAX_EXERCISE_CREDIT) {
        const credit = Math.min(entity.item.kcal, MAX_EXERCISE_KCAL - state.exerciseEnergy);
        state.exerciseCount += 1;
        state.exerciseEnergy += credit;
        showFeedback(`Exercise −${credit} kcal · goal complete!`);
      } else {
        showFeedback("Exercise goal already complete — nice movement!");
      }
      return;
    }

    const item = entity.item;
    state.foodEnergy += item.kcal;
    state.mealFoods[state.stage].push(item);
    const groups = Array.isArray(item.group) ? item.group : [item.group];
    groups.forEach(group => state.mealGroups[state.stage].add(group));
    if (item.name === "Plain water") {
      state.hydration = true;
      showFeedback("Hydration Star earned! 💧");
    } else if (item.name === "Iced Milo") {
      showFeedback(`+${item.kcal} kcal · Enjoy less often — water is the everyday choice.`);
    } else if (groups.includes("fruit")) {
      showFeedback(`+${item.kcal} kcal · Fruit bonus!`);
    } else {
      showFeedback(`+${item.kcal} kcal · ${item.name}`);
    }
  }

  function assessMeal(index) {
    if (state.assessedStages.has(index)) return;
    state.assessedStages.add(index);
    const groups = state.mealGroups[index];
    const needed = ["carbohydrate", "protein"];
    const missing = needed.filter(group => !groups.has(group));
    if (missing.length === 0) {
      state.balancedMeals += 1;
      showFeedback(`${STAGES[index].name}: Balanced meal! ✓`);
    } else {
      showFeedback(`${STAGES[index].name} missing: ${missing.join(", ")}`);
    }
  }

  function finishGame() {
    state.mode = "finished";
    document.body.dataset.gameState = "finished";
    pauseButton.disabled = true;
    setRunning(false);
    assessMeal(2);
    state.entities.forEach(entity => entity.node.remove());
    state.entities = [];
    updateHud();

    const food = Math.round(state.foodEnergy);
    const movement = Math.round(totalMovement());
    const net = Math.round(food - movement);
    const exerciseComplete = exerciseGoalComplete();
    const produceComplete = produceGoalComplete();
    const calorieWarning = net >= 1500 && net < TARGET_MIN;
    const won = net >= TARGET_MIN && net <= TARGET_MAX && state.balancedMeals >= 2 && produceComplete && exerciseComplete;
    const tip = improvementTip(net, exerciseComplete, produceComplete);

    overlay.classList.remove("success", "warning", "fail");
    overlay.classList.add(won ? "success" : calorieWarning ? "warning" : "fail");
    onboarding.hidden = true;
    overlayIcon.hidden = false;
    overlayIcon.textContent = "↻";
    overlayIcon.disabled = false;
    overlayIcon.setAttribute("aria-label", "Replay game");
    overlayKicker.textContent = won ? "Balanced Day!" : calorieWarning ? "Almost there" : "Try Again";
    overlayKicker.hidden = false;
    overlayTitle.textContent = won ? "SUCCESS" : calorieWarning ? "WARNING" : "FAIL";
    overlayTitle.hidden = false;
    overlayCopy.textContent = won
      ? "Keep it up! You eat enough, balanced and active."
      : calorieWarning ? "Calorie deficit! Are you on diet?" : tip;
    overlayCopy.hidden = false;
    const netBalanced = net >= TARGET_MIN && net <= TARGET_MAX;
    resultGrid.innerHTML = [
      { label: "Food energy", value: `${food} kcal`, status: "neutral" },
      { label: "Additional activity calories", value: `${movement} kcal`, status: "neutral" },
      { label: "Final net energy", value: `${net} kcal`, status: netBalanced ? "good" : calorieWarning ? "warn" : "bad" },
      { label: "Balanced meals", value: `${state.balancedMeals}/3`, status: state.balancedMeals >= 2 ? "good" : "bad" },
      { label: "Fruit / veg goal", value: produceComplete ? "Complete ✓" : "Incomplete", status: produceComplete ? "good" : "bad" },
      { label: "Exercise goal", value: exerciseComplete ? "Complete ✓" : "Incomplete", status: exerciseComplete ? "good" : "bad" },
      { label: "Hydration Star", value: state.hydration ? "Earned ★" : "Not earned", status: state.hydration ? "good" : "bad" }
    ].map(item => `<div class="${item.status}">${item.label}<strong>${item.value}</strong></div>`).join("");
    resultGrid.hidden = false;
    activityNote.hidden = false;
    mealFoods.innerHTML = `<h3>Foods collected</h3>${STAGES.map((stage, index) => {
      const foods = state.mealFoods[index];
      const list = foods.length
        ? `<ul>${foods.map(item => `<li><span>${item.icon} ${item.name}</span><strong>${item.kcal} kcal</strong><small>${item.serving}</small></li>`).join("")}</ul>`
        : `<p class="empty-meal">Nothing collected</p>`;
      return `<section><h4>${stage.name}</h4>${list}</section>`;
    }).join("")}`;
    mealFoods.hidden = false;
    $(".overlay-panel").scrollTop = 0;
    overlay.hidden = false;
    overlayIcon.focus({ preventScroll: true });
  }

  function improvementTip(net, exerciseComplete, produceComplete) {
    if (net < TARGET_MIN) return "UNDEREAT! Are you on diet or feel sick?";
    if (net > TARGET_MAX) return "OVEREAT! Watch your diet and exercise.";
    if (state.balancedMeals < 2) return "Build at least two meals with carbohydrate and protein.";
    if (!produceComplete) return "Collect fruit or vegetables at least once during the day.";
    if (!exerciseComplete) return "Run for 10 seconds or collect an exercise item.";
    return "Keep experimenting with different balanced choices.";
  }

  function totalMovement() {
    return state.movementEnergy + state.exerciseEnergy;
  }

  function exerciseGoalComplete() {
    return state.exerciseCount > 0 || state.runSeconds >= 10;
  }

  function produceGoalComplete() {
    return state.mealGroups.some(groups => groups.has("vegetable") || groups.has("fruit"));
  }

  function updateHud() {
    const movement = Math.round(totalMovement());
    const net = Math.round(state.foodEnergy - totalMovement());
    const remaining = Math.max(0, Math.ceil(GAME_SECONDS - state.elapsed));
    $("#food-energy").textContent = Math.round(state.foodEnergy);
    $("#net-energy").textContent = net;
    $("#balanced-meals").textContent = `${state.balancedMeals}/3`;
    $("#exercise-status").textContent = exerciseGoalComplete() ? "✓" : "○";
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    $("#time-left").textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    const meterValue = Math.max(0, Math.min(2400, net));
    meter.setAttribute("aria-valuenow", String(meterValue));
    energyMarker.style.left = `${meterValue / 2400 * 100}%`;
    energyMarker.firstElementChild.textContent = net;
  }

  function moveLane(direction, reset = false) {
    if (!state || (state.mode !== "playing" && !reset)) return;
    state.lane = reset ? 1 : Math.max(0, Math.min(2, state.lane + direction));
    runner.style.left = `${LANES[state.lane]}%`;
  }

  function setRunning(value) {
    if (!state || state.mode !== "playing") value = false;
    state.running = value;
    runner.classList.toggle("running", value);
    runner.classList.toggle("moving", state.mode === "playing");
    board.classList.toggle("playing", state.mode === "playing");
    board.classList.toggle("running", value);
    runButton.classList.toggle("active", value);
    moveStatus.textContent = value ? "RUNNING" : "WALKING";
  }

  function showFeedback(message) {
    window.clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedback.classList.remove("show");
    void feedback.offsetWidth;
    feedback.classList.add("show");
    feedbackTimer = window.setTimeout(() => feedback.classList.remove("show"), 1500);
  }

  function pauseGame() {
    if (!state || state.mode !== "playing") return;
    state.mode = "paused";
    document.body.dataset.gameState = "paused";
    pauseButton.disabled = true;
    setRunning(false);
    overlay.classList.remove("success", "warning", "fail");
    onboarding.hidden = true;
    overlayIcon.hidden = false;
    overlayIcon.textContent = "▶";
    overlayIcon.disabled = false;
    overlayIcon.setAttribute("aria-label", "Resume game");
    overlayKicker.hidden = true;
    overlayTitle.textContent = "Game paused";
    overlayTitle.hidden = false;
    overlayCopy.hidden = true;
    resultGrid.hidden = true;
    activityNote.hidden = true;
    mealFoods.hidden = true;
    overlay.hidden = false;
    overlayIcon.focus({ preventScroll: true });
  }

  function resumeGame() {
    state.mode = "playing";
    document.body.dataset.gameState = "playing";
    pauseButton.disabled = false;
    overlay.hidden = true;
    lastFrame = performance.now();
    runner.classList.add("moving");
    scheduleLoop();
  }

  function scheduleLoop() {
    frameId = window.setTimeout(() => gameLoop(performance.now()), 16);
  }

  function stopLoop() {
    if (frameId !== null) window.clearTimeout(frameId);
    frameId = null;
  }

  function shuffled(values) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  function bindHold(button) {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      setRunning(true);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => button.addEventListener(type, () => setRunning(false)));
  }

  $("#left-button").addEventListener("click", () => moveLane(-1));
  $("#right-button").addEventListener("click", () => moveLane(1));
  pauseButton.addEventListener("click", pauseGame);
  bindHold(runButton);

  board.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    touchStart = { x: event.clientX, y: event.clientY };
  });
  board.addEventListener("pointerup", event => {
    if (!touchStart || state.mode !== "playing") return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    touchStart = null;
  });
  board.addEventListener("pointercancel", () => { touchStart = null; });

  document.addEventListener("keydown", event => {
    if (state.mode !== "playing") return;
    if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
    if (event.repeat && event.key !== " ") return;
    if (event.key === "ArrowLeft") moveLane(-1);
    if (event.key === "ArrowRight") moveLane(1);
    if (event.key === " ") setRunning(true);
  });
  document.addEventListener("keyup", event => {
    if (event.key === " ") setRunning(false);
  });
  window.addEventListener("blur", pauseGame);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });

  overlayIcon.addEventListener("click", () => {
    if (state.mode === "paused") resumeGame();
    else if (state.mode === "finished") showOnboarding();
  });

  function setOnboardingSlide(index) {
    onboardingSlide = Math.max(0, Math.min(onboardingSlides.length - 1, index));
    onboardingSlides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== onboardingSlide; });
    slideDots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === onboardingSlide));
    slideBack.disabled = onboardingSlide === 0;
    slideNext.disabled = onboardingSlide === onboardingSlides.length - 1;
    (onboardingSlide === 0 ? slideNext : startButton).focus({ preventScroll: true });
  }

  function showOnboarding() {
    stopLoop();
    window.clearTimeout(mealBannerTimer);
    itemsLayer.replaceChildren();
    state = freshState();
    document.body.dataset.gameState = "idle";
    board.classList.remove("playing", "running", "lunch", "dinner");
    board.classList.add("breakfast");
    $("#meal-banner").classList.remove("stage-pop");
    pauseButton.disabled = true;
    moveLane(0, true);
    setRunning(false);
    updateHud();
    overlay.classList.remove("success", "warning", "fail");
    $(".overlay-panel").scrollTop = 0;
    onboarding.hidden = false;
    overlayIcon.hidden = true;
    overlayIcon.disabled = true;
    overlayKicker.hidden = true;
    overlayTitle.hidden = true;
    overlayCopy.hidden = true;
    resultGrid.hidden = true;
    activityNote.hidden = true;
    mealFoods.hidden = true;
    mealFoods.replaceChildren();
    overlay.hidden = false;
    setOnboardingSlide(0);
  }

  slideBack.addEventListener("click", () => setOnboardingSlide(onboardingSlide - 1));
  slideNext.addEventListener("click", () => setOnboardingSlide(onboardingSlide + 1));
  startButton.addEventListener("click", startGame);

  showOnboarding();
})();
