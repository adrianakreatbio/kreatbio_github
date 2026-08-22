(() => {
  "use strict";

  const GRID_SIZE = 20;
  const START_SPEED = 170;
  const MIN_SPEED = 80;
  const SPEED_STEP = 12;
  const SPEED_INTERVAL = 5;
  const POINTS_PER_BASE = 10;
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
    A: "#007c78",
    C: "#2667a6",
    G: "#9b6d00",
    T: "#87548a"
  };

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
  const directionButtons = [...document.querySelectorAll("[data-direction]")];

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

  function resetGame() {
    stopTimer();
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
    statusElement.textContent = "Running";
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
    const ateFood = nextHead.x === food.x && nextHead.y === food.y;
    const bodyToCheck = ateFood ? snake : snake.slice(0, -1);

    if (isOutsideBoard(nextHead) || bodyToCheck.some(segment => sameCell(segment, nextHead))) {
      endGame();
      return;
    }

    snake.unshift(nextHead);

    if (ateFood) {
      collected += 1;
      score += POINTS_PER_BASE;
      speed = Math.max(MIN_SPEED, START_SPEED - Math.floor(collected / SPEED_INTERVAL) * SPEED_STEP);
      food = createFood();
      updateScore();
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
    statusElement.textContent = completedPlate ? "Plate complete" : "Run complete";
    pauseButton.disabled = true;
    pauseButton.classList.remove("is-paused");
    vibrate([30, 45, 30]);
    showOverlay(completedPlate ? {
      kicker: "Perfect sequence",
      title: "You cleared the plate",
      copy: `Final score: ${score}. That was exceptionally clean work.`,
      button: "Play again"
    } : {
      kicker: "Sequence interrupted",
      title: `You collected ${collected} ${collected === 1 ? "base" : "bases"}`,
      copy: `Final score: ${score}. Clean the plate and try another run.`,
      button: "Play again"
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
    statusElement.textContent = "Paused";
    pauseButton.classList.add("is-paused");
    pauseButton.setAttribute("aria-label", "Resume game");
    showOverlay({
      kicker: "Run paused",
      title: "Your sample is safe",
      copy: "Resume whenever you’re ready to get back to the plate.",
      button: "Resume"
    });
  }

  function resumeGame() {
    if (gameState !== "paused") return;
    gameState = "playing";
    statusElement.textContent = "Running";
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

  function handleOverlayAction() {
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
        if (!snake.some(segment => segment.x === x && segment.y === y)) {
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

  function isOutsideBoard(cell) {
    return cell.x < 0 || cell.y < 0 || cell.x >= GRID_SIZE || cell.y >= GRID_SIZE;
  }

  function sameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function updateScore() {
    scoreElement.textContent = String(score);
  }

  function vibrate(pattern) {
    if ("vibrate" in navigator) {
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
    context.fillStyle = "#f5fbfa";
    context.fillRect(0, 0, boardSize, boardSize);
    context.strokeStyle = "rgba(0, 124, 120, 0.09)";
    context.lineWidth = 1;

    for (let index = 1; index < GRID_SIZE; index += 1) {
      const position = index * cellSize;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, boardSize);
      context.stroke();
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(boardSize, position);
      context.stroke();
    }
  }

  function drawFood(item, cellSize) {
    const centerX = (item.x + 0.5) * cellSize;
    const centerY = (item.y + 0.5) * cellSize;
    const radius = cellSize * 0.37;

    context.save();
    context.shadowColor = "rgba(7, 27, 58, 0.2)";
    context.shadowBlur = cellSize * 0.24;
    context.shadowOffsetY = cellSize * 0.08;
    context.fillStyle = BASE_COLORS[item.base];
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.fillStyle = "#ffffff";
    context.font = `800 ${cellSize * 0.48}px Inter, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.base, centerX, centerY + cellSize * 0.02);
  }

  function drawSnakeSegment(segment, index, cellSize) {
    const padding = cellSize * (index === 0 ? 0.08 : 0.13);
    const x = segment.x * cellSize + padding;
    const y = segment.y * cellSize + padding;
    const size = cellSize - padding * 2;

    context.fillStyle = index === 0 ? "#071b3a" : index % 2 === 0 ? "#007c78" : "#13938d";
    roundRect(context, x, y, size, size, cellSize * 0.22);
    context.fill();

    if (index === 0) {
      drawPipetteHead(segment, cellSize);
    } else {
      context.fillStyle = "rgba(255, 255, 255, 0.68)";
      context.beginPath();
      context.arc((segment.x + 0.5) * cellSize, (segment.y + 0.5) * cellSize, cellSize * 0.075, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPipetteHead(segment, cellSize) {
    const centerX = (segment.x + 0.5) * cellSize;
    const centerY = (segment.y + 0.5) * cellSize;
    const vector = VECTORS[direction];
    const sideX = -vector.y;
    const sideY = vector.x;
    const tipX = centerX + vector.x * cellSize * 0.3;
    const tipY = centerY + vector.y * cellSize * 0.3;

    context.fillStyle = "#7fd6cc";
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(centerX - vector.x * cellSize * 0.12 + sideX * cellSize * 0.16, centerY - vector.y * cellSize * 0.12 + sideY * cellSize * 0.16);
    context.lineTo(centerX - vector.x * cellSize * 0.12 - sideX * cellSize * 0.16, centerY - vector.y * cellSize * 0.12 - sideY * cellSize * 0.16);
    context.closePath();
    context.fill();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, safeRadius);
  }

  function handleKeydown(event) {
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
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if ("ResizeObserver" in window) {
    new ResizeObserver(resizeCanvas).observe(boardWrap);
  } else {
    window.addEventListener("resize", resizeCanvas);
  }

  resetGame();
  resizeCanvas();
})();
