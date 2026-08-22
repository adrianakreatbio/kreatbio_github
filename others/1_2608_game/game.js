(() => {
  "use strict";

  const GRID_SIZE = 20;
  const START_SPEED = 280;
  const MIN_SPEED = 90;
  const SPEED_STEP = 5;
  const SPEED_INTERVAL = 1;
  const POINTS_PER_BASE = 10;
  const PLAY_RADIUS = 9.15;
  const GRID_CENTER = (GRID_SIZE - 1) / 2;
  const BASES = ["A", "C", "G", "T"];
  const VECTORS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const OPPOSITES = {
    up: "down",
    down: "up",
    left: "right",
    right: "left"
  };
  const KEY_DIRECTIONS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right"
  };
  const BASE_COLORS = {
    A: "#72eadc",
    C: "#6ca9ff",
    G: "#ffc857",
    T: "#ff7595"
  };
  const TRAIL_COLORS = ["#a879f2", "#72eadc", "#ff7595", "#6ca9ff", "#d4ff70"];
  const DIRECTION_ANGLES = {
    up: 0,
    right: Math.PI / 2,
    down: Math.PI,
    left: -Math.PI / 2
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.querySelector("#game-board");
  const context = canvas.getContext("2d");
  const boardWrap = document.querySelector("#board-wrap");
  const scoreElement = document.querySelector("#score");
  const statusElement = document.querySelector("#game-status");
  const pauseButton = document.querySelector("#pause-button");
  const overlay = document.querySelector("#game-overlay");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const overlayButton = document.querySelector("#overlay-button");
  const mascotElement = document.querySelector(".microbe-mascot");
  const directionButtons = [...document.querySelectorAll("[data-direction]")];
  mascotElement.addEventListener("error", () => mascotElement.classList.add("is-unavailable"));
  const microbeImage = new Image();
  let microbeImageReady = false;
  microbeImage.addEventListener("load", () => {
    microbeImageReady = true;
    draw();
  });
  microbeImage.addEventListener("error", () => {
    microbeImageReady = false;
    mascotElement.classList.add("is-unavailable");
  });
  microbeImage.src = "assets/base-muncher-bacterium.png";

  let snake = [];
  let food = null;
  let direction = "right";
  let canTurn = true;
  let score = 0;
  let collected = 0;
  let speed = START_SPEED;
  let gameState = "idle";
  let timerId = null;
  let boardSize = 600;
  let pointerStart = null;
  let bursts = [];
  let effectFrame = null;
  let allowHaptics = false;
  let lastOverlayActivation = -Infinity;

  function resetGame() {
    stopTimer();
    if (effectFrame !== null) {
      window.cancelAnimationFrame(effectFrame);
      effectFrame = null;
    }
    bursts = [];
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ];
    direction = "right";
    canTurn = true;
    score = 0;
    collected = 0;
    speed = START_SPEED;
    food = createFood();
    updateScore();
    draw();
  }

  function startGame() {
    resetGame();
    gameState = "playing";
    statusElement.textContent = "Munching";
    pauseButton.disabled = false;
    pauseButton.classList.remove("is-paused");
    pauseButton.setAttribute("aria-label", "Pause game");
    overlay.hidden = true;
    scheduleTick();
  }

  function scheduleTick() {
    stopTimer();
    if (gameState === "playing") {
      timerId = window.setTimeout(tick, speed);
    }
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
  }

  function tick() {
    const vector = VECTORS[direction];
    const head = snake[0];
    const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
    const ateFood = food && nextHead.x === food.x && nextHead.y === food.y;
    const bodyToCheck = ateFood ? snake : snake.slice(0, -1);

    if (!isPlayableCell(nextHead) || bodyToCheck.some(segment => sameCell(segment, nextHead))) {
      endGame();
      return;
    }

    snake.unshift(nextHead);

    if (ateFood) {
      const collectedBase = food.base;
      collected += 1;
      score += POINTS_PER_BASE;
      speed = Math.max(MIN_SPEED, START_SPEED - Math.floor(collected / SPEED_INTERVAL) * SPEED_STEP);
      food = createFood();
      updateScore();
      addCollectionEffect(nextHead, collectedBase);
      vibrate(18);
      if (food === null) {
        draw();
        endGame(true);
        return;
      }
    } else {
      snake.pop();
    }

    canTurn = true;
    draw();
    scheduleTick();
  }

  function endGame(completedPlate = false) {
    gameState = "gameover";
    stopTimer();
    statusElement.textContent = completedPlate ? "Dish cleared" : "Culture crash";
    pauseButton.disabled = true;
    pauseButton.classList.remove("is-paused");
    vibrate([30, 45, 30]);
    showOverlay(completedPlate ? {
      kicker: "Super colony",
      title: "You cleared the dish!",
      copy: `Final score: ${score}. Your tiny culture has a huge appetite.`,
      button: "Grow again"
    } : {
      kicker: "Culture crash",
      title: `You munched ${collected} ${collected === 1 ? "base" : "bases"}`,
      copy: `Final score: ${score}. Give your little colony another chance.`,
      button: "Grow again"
    });
  }

  function togglePause() {
    if (gameState === "playing") {
      pauseGame();
    } else if (gameState === "paused") {
      resumeGame();
    }
  }

  function pauseGame() {
    if (gameState !== "playing") return;
    gameState = "paused";
    stopTimer();
    statusElement.textContent = "Napping";
    pauseButton.classList.add("is-paused");
    pauseButton.setAttribute("aria-label", "Resume game");
    showOverlay({
      kicker: "Microbe nap time",
      title: "Your colony is snoozing",
      copy: "Wake the little muncher whenever you’re ready.",
      button: "Wake up"
    });
  }

  function resumeGame() {
    if (gameState !== "paused") return;
    gameState = "playing";
    statusElement.textContent = "Munching";
    pauseButton.classList.remove("is-paused");
    pauseButton.setAttribute("aria-label", "Pause game");
    overlay.hidden = true;
    scheduleTick();
  }

  function showOverlay({ kicker, title, copy, button }) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    overlayButton.textContent = button;
    overlay.hidden = false;
    overlayButton.focus({ preventScroll: true });
  }

  function handleOverlayAction(event) {
    if (event.type === "pointerup") {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.stopPropagation();
    }

    // Pointer devices normally emit a click immediately after pointerup. Keep
    // both paths for broad browser support, but treat them as one activation.
    const now = performance.now();
    if (now - lastOverlayActivation < 350) return;
    lastOverlayActivation = now;

    if (gameState === "paused") {
      resumeGame();
    } else {
      startGame();
    }
  }

  function setDirection(nextDirection) {
    if (gameState !== "playing" || !canTurn || OPPOSITES[direction] === nextDirection) return;
    direction = nextDirection;
    canTurn = false;
    flashDirectionButton(nextDirection);
  }

  function flashDirectionButton(nextDirection) {
    const button = directionButtons.find(item => item.dataset.direction === nextDirection);
    if (!button) return;
    button.classList.add("is-pressed");
    window.setTimeout(() => button.classList.remove("is-pressed"), 90);
  }

  function createFood() {
    const openCells = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (isPlayableCell({ x, y }) && !snake.some(segment => segment.x === x && segment.y === y)) {
          openCells.push({ x, y });
        }
      }
    }

    if (openCells.length === 0) {
      return null;
    }

    const cell = openCells[Math.floor(Math.random() * openCells.length)];
    return { ...cell, base: BASES[Math.floor(Math.random() * BASES.length)] };
  }

  function isPlayableCell(cell) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= GRID_SIZE || cell.y >= GRID_SIZE) {
      return false;
    }
    return Math.hypot(cell.x - GRID_CENTER, cell.y - GRID_CENTER) <= PLAY_RADIUS;
  }

  function sameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function updateScore() {
    scoreElement.textContent = String(score);
    if (score > 0 && !reducedMotion) {
      scoreElement.classList.remove("score-pop");
      void scoreElement.offsetWidth;
      scoreElement.classList.add("score-pop");
      window.setTimeout(() => scoreElement.classList.remove("score-pop"), 180);
    }
  }

  function addCollectionEffect(cell, base) {
    if (reducedMotion) return;
    bursts.push({ ...cell, color: BASE_COLORS[base], startedAt: performance.now() });
    if (effectFrame === null) {
      effectFrame = window.requestAnimationFrame(animateEffects);
    }
  }

  function animateEffects(timestamp) {
    bursts = bursts.filter(burst => timestamp - burst.startedAt < 380);
    draw();
    bursts.forEach(burst => drawBurst(burst, timestamp));

    if (bursts.length > 0) {
      effectFrame = window.requestAnimationFrame(animateEffects);
    } else {
      effectFrame = null;
    }
  }

  function vibrate(pattern) {
    const hasUserActivation = !("userActivation" in navigator) || navigator.userActivation.hasBeenActive;
    if ("vibrate" in navigator && allowHaptics && hasUserActivation) {
      navigator.vibrate(pattern);
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardSize = rect.width || 600;
    canvas.width = Math.round(boardSize * dpr);
    canvas.height = Math.round(boardSize * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const cellSize = boardSize / GRID_SIZE;
    context.clearRect(0, 0, boardSize, boardSize);
    drawPlate(cellSize);

    if (food) {
      drawFood(food, cellSize);
    }

    snake.slice().reverse().forEach((segment, reverseIndex) => {
      const originalIndex = snake.length - reverseIndex - 1;
      drawSnakeSegment(segment, originalIndex, cellSize);
    });
  }

  function drawPlate(cellSize) {
    context.fillStyle = "#0d1015";
    context.fillRect(0, 0, boardSize, boardSize);

    context.save();
    context.beginPath();
    context.arc(boardSize / 2, boardSize / 2, boardSize * 0.495, 0, Math.PI * 2);
    context.clip();

    context.fillStyle = "#15252a";
    context.fillRect(0, 0, boardSize, boardSize);

    context.strokeStyle = "rgba(114, 234, 220, 0.14)";
    context.lineWidth = Math.max(1, cellSize * 0.08);
    context.beginPath();
    context.arc(boardSize / 2, boardSize / 2, boardSize * 0.47, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawFood(item, cellSize) {
    const centerX = (item.x + 0.5) * cellSize;
    const centerY = (item.y + 0.5) * cellSize;
    const pulse = reducedMotion ? 0 : Math.sin(performance.now() / 135) * cellSize * 0.035;
    const radius = cellSize * 0.41 + pulse;

    context.save();
    context.shadowColor = BASE_COLORS[item.base];
    context.shadowBlur = cellSize * 0.75;
    context.fillStyle = BASE_COLORS[item.base];
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.strokeStyle = `${BASE_COLORS[item.base]}99`;
    context.lineWidth = Math.max(1.2, cellSize * 0.065);
    context.beginPath();
    context.arc(centerX, centerY, radius + cellSize * 0.1, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "#15171c";
    context.font = `900 ${cellSize * 0.5}px ui-rounded, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.base, centerX, centerY + cellSize * 0.02);
  }

  function drawSnakeSegment(segment, index, cellSize) {
    if (index === 0) {
      drawMicrobeLeader(segment, cellSize);
    } else {
      drawDaughterCell(segment, index, cellSize);
    }
  }

  function drawMicrobeLeader(segment, cellSize) {
    const centerX = (segment.x + 0.5) * cellSize;
    const centerY = (segment.y + 0.5) * cellSize;
    const angle = DIRECTION_ANGLES[direction];

    context.save();
    context.translate(centerX, centerY);
    context.shadowColor = "rgba(183, 138, 255, 0.8)";
    context.shadowBlur = cellSize * 0.75;
    context.fillStyle = "rgba(183, 138, 255, 0.18)";
    context.beginPath();
    context.arc(0, 0, cellSize * 0.58, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.rotate(angle);

    if (microbeImageReady) {
      const imageSize = cellSize * 2.75;
      context.drawImage(microbeImage, -imageSize / 2, -imageSize / 2, imageSize, imageSize);
    } else {
      drawFallbackMicrobe(cellSize);
    }
    context.restore();
  }

  function drawFallbackMicrobe(cellSize) {
    const width = cellSize * 0.72;
    const height = cellSize * 1.04;
    context.fillStyle = "#a968ef";
    roundRect(context, -width / 2, -height / 2, width, height, width / 2);
    context.fill();
    context.fillStyle = "#17191f";
    context.beginPath();
    context.arc(-width * 0.16, -height * 0.08, cellSize * 0.055, 0, Math.PI * 2);
    context.arc(width * 0.16, -height * 0.08, cellSize * 0.055, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#17191f";
    context.lineWidth = Math.max(1, cellSize * 0.05);
    context.beginPath();
    context.arc(0, height * 0.06, cellSize * 0.13, 0.15, Math.PI - 0.15);
    context.stroke();
  }

  function drawDaughterCell(segment, index, cellSize) {
    const ahead = snake[index - 1];
    const vector = ahead ? { x: ahead.x - segment.x, y: ahead.y - segment.y } : VECTORS[direction];
    const angle = Math.atan2(vector.y, vector.x);
    const centerX = (segment.x + 0.5) * cellSize;
    const centerY = (segment.y + 0.5) * cellSize;
    const width = cellSize * 0.82;
    const height = cellSize * 0.57;
    const color = TRAIL_COLORS[(index - 1) % TRAIL_COLORS.length];

    context.save();
    context.translate(centerX, centerY);
    context.rotate(angle);
    context.shadowColor = color;
    context.shadowBlur = cellSize * 0.34;
    context.fillStyle = color;
    roundRect(context, -width / 2, -height / 2, width, height, height / 2);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(22, 24, 30, 0.46)";
    context.lineWidth = Math.max(1, cellSize * 0.055);
    context.beginPath();
    context.moveTo(0, -height * 0.34);
    context.lineTo(0, height * 0.34);
    context.stroke();
    context.fillStyle = "rgba(255, 255, 255, 0.58)";
    context.beginPath();
    context.ellipse(-width * 0.2, -height * 0.17, width * 0.09, height * 0.08, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawBurst(burst, timestamp) {
    const cellSize = boardSize / GRID_SIZE;
    const progress = Math.min(1, (timestamp - burst.startedAt) / 380);
    const centerX = (burst.x + 0.5) * cellSize;
    const centerY = (burst.y + 0.5) * cellSize;
    const radius = cellSize * (0.35 + progress * 1.15);

    context.save();
    context.globalAlpha = 1 - progress;
    context.strokeStyle = burst.color;
    context.lineWidth = Math.max(1, cellSize * 0.11 * (1 - progress));
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();

    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      const distance = cellSize * (0.5 + progress * 1.35);
      context.fillStyle = index % 2 === 0 ? burst.color : "#d4ff70";
      context.beginPath();
      context.arc(
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
        Math.max(1.2, cellSize * 0.09 * (1 - progress * 0.55)),
        0,
        Math.PI * 2
      );
      context.fill();
    }
    context.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
  }

  function handleKeydown(event) {
    if (event.isTrusted) {
      allowHaptics = true;
    }
    const nextDirection = KEY_DIRECTIONS[event.key];
    if (nextDirection) {
      event.preventDefault();
      setDirection(nextDirection);
      return;
    }

    if ((event.key === " " || event.key === "p" || event.key === "P") && gameState !== "idle" && gameState !== "gameover") {
      event.preventDefault();
      togglePause();
    }
  }

  function handlePointerDown(event) {
    // Do not capture presses while an overlay button is being used. Capturing
    // the mouse on the dish can redirect pointerup away from the button and
    // prevent desktop browsers from dispatching its click event.
    if (gameState !== "playing" || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    pointerStart = { x: event.clientX, y: event.clientY };
    boardWrap.setPointerCapture?.(event.pointerId);
  }

  function handlePointerUp(event) {
    if (!pointerStart) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = null;

    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setDirection(deltaX > 0 ? "right" : "left");
    } else {
      setDirection(deltaY > 0 ? "down" : "up");
    }
  }

  function handleVisibilityChange() {
    if (document.hidden && gameState === "playing") {
      pauseGame();
    }
  }

  overlayButton.addEventListener("pointerdown", event => event.stopPropagation());
  overlayButton.addEventListener("pointerup", handleOverlayAction);
  overlayButton.addEventListener("click", handleOverlayAction);
  pauseButton.addEventListener("click", togglePause);
  directionButtons.forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      setDirection(button.dataset.direction);
    });
    button.addEventListener("click", () => setDirection(button.dataset.direction));
  });
  boardWrap.addEventListener("pointerdown", handlePointerDown);
  boardWrap.addEventListener("pointerup", handlePointerUp);
  boardWrap.addEventListener("pointercancel", () => { pointerStart = null; });
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("pointerdown", event => {
    if (event.isTrusted) {
      allowHaptics = true;
    }
  }, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if ("ResizeObserver" in window) {
    new ResizeObserver(resizeCanvas).observe(boardWrap);
  } else {
    window.addEventListener("resize", resizeCanvas);
  }

  resetGame();
  resizeCanvas();
})();
