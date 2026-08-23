(() => {
  "use strict";

  const WORLD = 600;
  const TOTAL_STATIONS = 5;
  const COLORS = {
    ink: "#15171d",
    bench: "#1b2028",
    panel: "#252b35",
    line: "#46505e",
    paper: "#f7f8fb",
    muted: "#aeb7c5",
    cyan: "#72eadc",
    lime: "#d4ff70",
    coral: "#ff7595",
    violet: "#b78aff",
    blue: "#6ca9ff",
    gold: "#ffc857"
  };
  const STATIONS = [
    { name: "Purify culture", short: "Culture", objective: "Pick the isolated purple colony → fresh plate" },
    { name: "Extract DNA", short: "Extract", objective: "Tap the transferred cells to lyse them and release DNA" },
    { name: "Normalize DNA", short: "QC", objective: "Goal: 20–30 ng/µL · hold ADD BUFFER to dilute the DNA" },
    { name: "Prepare library", short: "Library", objective: "Adapters are sequencing handles · drag ADAPTERS → DNA ends" },
    { name: "Load & sequence", short: "Reads", objective: "Drag the prepared library → flow-cell loading port" }
  ];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.createPlateToReads = function createPlateToReads(options) {
    const { canvas, image, onHud = () => {}, onEnd = () => {} } = options;
    const ctx = canvas.getContext("2d");
    let state = "idle";
    let station = 0;
    let risk = 0;
    let totalMistakes = 0;
    let frameId = null;
    let lastTime = 0;
    let scale = 1;
    let selected = null;
    let drag = null;
    let pointerId = null;
    let cursor = { x: 300, y: 330 };
    let keyboardUsed = false;
    let feedback = "";
    let feedbackTone = "info";
    let feedbackUntil = 0;
    let stationComplete = false;
    let advanceAt = 0;
    let resetAt = 0;
    let cultureStep = 0;
    let incubationStarted = 0;
    let transferStarted = 0;
    let magnetOn = false;
    let magnetProgress = 0;
    let bindingProgress = 0;
    let extractionStep = 0;
    let qcLevel = 0;
    let qcDispensing = false;
    let libraryStep = 0;
    let sequencing = false;
    let sequencingStarted = 0;
    let completed = false;

    const colonies = [
      { id: "clean", x: 173, y: 306, r: 24, clean: true },
      { id: "c1", x: 104, y: 225, r: 23, clean: false },
      { id: "c2", x: 222, y: 218, r: 21, clean: false },
      { id: "c3", x: 111, y: 374, r: 25, clean: false },
      { id: "c4", x: 229, y: 390, r: 22, clean: false }
    ];

    function start() {
      station = 0;
      risk = 0;
      totalMistakes = 0;
      completed = false;
      state = "playing";
      initStation();
      resize();
      emitHud();
      runFrame();
    }

    function pause() {
      if (state !== "playing") return;
      state = "paused";
      cancelFrame();
      qcDispensing = false;
      drag = null;
    }

    function resume() {
      if (state !== "paused") return;
      state = "playing";
      lastTime = performance.now();
      emitHud();
      runFrame();
    }

    function destroy() {
      state = "destroyed";
      cancelFrame();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      selected = null;
      drag = null;
    }

    function initStation() {
      selected = null;
      drag = null;
      stationComplete = false;
      advanceAt = 0;
      resetAt = 0;
      feedback = "";
      feedbackUntil = 0;
      cultureStep = 0;
      incubationStarted = 0;
      transferStarted = 0;
      magnetOn = false;
      magnetProgress = 0;
      bindingProgress = 0;
      extractionStep = 0;
      qcLevel = 0;
      qcDispensing = false;
      libraryStep = 0;
      sequencing = false;
      sequencingStarted = 0;
      cursor = { x: 300, y: station === 0 ? 306 : 365 };
      emitHud();
    }

    function runFrame() {
      cancelFrame();
      lastTime = performance.now();
      frameId = requestAnimationFrame(frame);
    }

    function cancelFrame() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    }

    function frame(now) {
      if (state !== "playing") {
        frameId = null;
        return;
      }
      const delta = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      update(delta, now);
      draw(now);
      frameId = requestAnimationFrame(frame);
    }

    function update(delta, now) {
      // Keep terminal feedback visible until its station advances or resets.
      // Otherwise the previous objective can flash for a single frame between
      // the success message and the next station.
      if (feedback && now > feedbackUntil && !stationComplete && !resetAt) {
        feedback = "";
        feedbackTone = "info";
        emitHud();
      }
      if (station === 0 && cultureStep === 2 && incubationStarted && now - incubationStarted >= 3400 && !stationComplete) {
        cultureStep = 3;
        incubationStarted = 0;
        say("Pure culture ready · collect cells with the sterile loop", COLORS.lime, 3000);
      }
      if (station === 0 && cultureStep === 5 && transferStarted && now - transferStarted >= 2200 && !stationComplete) {
        completeStation("Cells released from the loop into the extraction tube");
      }
      if (station === 1 && extractionStep === 2) {
        const previousBinding = bindingProgress;
        bindingProgress = Math.min(1, bindingProgress + delta * 0.55);
        if (previousBinding < 0.9 && bindingProgress >= 0.9) emitHud();
      }
      if (station === 1 && magnetOn) magnetProgress = Math.min(1, magnetProgress + delta * 0.6);
      if (station === 2 && qcDispensing) {
        qcLevel = Math.min(1, qcLevel + delta * 0.34);
        if (qcLevel >= 0.94) finishQcDispense();
      }
      if (resetAt && now >= resetAt) {
        risk = 0;
        initStation();
      }
      if (stationComplete && advanceAt && now >= advanceAt) {
        if (station < TOTAL_STATIONS - 1) {
          station += 1;
          risk = 0;
          initStation();
        }
      }
      if (sequencing && sequencingStarted && now - sequencingStarted >= 4500 && !completed) finishGame();
    }

    function emitHud(objectiveOverride, tone = feedback ? feedbackTone : "info") {
      onHud({
        station: station + 1,
        totalStations: TOTAL_STATIONS,
        risk,
        objective: objectiveOverride || currentObjective(),
        tone,
        stationName: STATIONS[station].name
      });
    }

    function currentObjective() {
      if (station === 0 && cultureStep === 1) return "Colony streaked on fresh plate · tap INCUBATE";
      if (station === 0 && cultureStep === 2) return "Incubating · one colony type means a pure culture";
      if (station === 0 && cultureStep === 3) return "Drag the sterile loop onto a purple colony";
      if (station === 0 && cultureStep === 4) return "Cells collected · drag the loaded loop into the tube";
      if (station === 0 && cultureStep === 5) return "Cells are leaving the loop and dispersing into the tube";
      if (station === 1 && extractionStep === 1) return "DNA released · move magnetic beads → tube";
      if (station === 1 && extractionStep === 2) return bindingProgress < 0.9 ? "DNA is binding to the magnetic beads" : "Drag the magnet → right side of the tube";
      if (station === 1 && extractionStep === 3) return "Use the pipette: drag liquid from tube → waste";
      if (station === 3 && libraryStep === 1) return "Adapters attached · choose INDEX K for indexing PCR";
      if (station === 4 && sequencing) return "Sequencing in progress · watch your reads appear";
      return STATIONS[station].objective;
    }

    function say(message, color = COLORS.cyan, duration = 3000) {
      feedback = message;
      feedbackTone = color === COLORS.coral ? "error" : color === COLORS.lime ? "success" : color === COLORS.gold ? "warning" : "info";
      feedbackUntil = performance.now() + duration;
      emitHud(message, feedbackTone);
    }

    function addRisk(message) {
      if (stationComplete || resetAt || sequencing) return;
      risk += 1;
      totalMistakes += 1;
      selected = null;
      drag = null;
      say(message, COLORS.coral, 3200);
      vibrate([28, 35, 28]);
      if (risk >= 3) {
        resetAt = performance.now() + 3400;
        say("Sample compromised — resetting this station", COLORS.coral, 3300);
      }
    }

    function completeStation(message) {
      if (stationComplete) return;
      stationComplete = true;
      selected = null;
      drag = null;
      say(message, COLORS.lime, 3300);
      advanceAt = performance.now() + 3400;
      vibrate(24);
    }

    function finishGame() {
      completed = true;
      state = "complete";
      cancelFrame();
      draw(performance.now());
      const rating = totalMistakes === 0 ? "Pristine library" : totalMistakes <= 3 ? "Clean library" : "Library rescued";
      const detail = totalMistakes === 0
        ? "Perfect bench work: clean reads, no spills and no sample mix-ups."
        : `Clean reads generated after ${totalMistakes} ${totalMistakes === 1 ? "bench mistake" : "bench mistakes"}.`;
      onEnd({ title: rating, copy: detail, mistakes: totalMistakes });
    }

    function handlePointerDown(event) {
      if (state !== "playing" || stationComplete || resetAt || sequencing) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const point = eventPoint(event);
      keyboardUsed = false;
      cursor = point;

      if (station === 2 && hitCircle(point, { x: 300, y: 440, r: 61 })) {
        qcDispensing = true;
        pointerId = event.pointerId;
        canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      if (selected) {
        resolveDrop(selected, point);
        selected = null;
        return;
      }

      const source = sourceAt(point);
      if (!source) return;
      const grabOffset = source.anchor
        ? { x: point.x - source.anchor.x, y: point.y - source.anchor.y }
        : { x: 0, y: 0 };
      drag = { source, start: point, point, grabOffset };
      pointerId = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event) {
      if (state !== "playing") return;
      cursor = eventPoint(event);
      if (drag && event.pointerId === pointerId) drag.point = cursor;
    }

    function handlePointerUp(event) {
      if (state !== "playing" || event.pointerId !== pointerId) return;
      const point = eventPoint(event);
      if (qcDispensing) finishQcDispense();
      if (drag) {
        const moved = Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 12;
        if (moved) {
          const destination = drag.source.anchor
            ? { x: point.x - drag.grabOffset.x, y: point.y - drag.grabOffset.y }
            : point;
          resolveDrop(drag.source, destination);
        } else {
          selected = drag.source;
          say(`Selected ${drag.source.label}. Tap its destination.`, COLORS.cyan, 2600);
        }
      }
      drag = null;
      pointerId = null;
    }

    function handlePointerCancel() {
      qcDispensing = false;
      drag = null;
      pointerId = null;
    }

    function sourceAt(point) {
      if (station === 0) {
        if (cultureStep === 1 && hitCircle(point, { x: 455, y: 465, r: 45 })) {
          cultureStep = 2;
          incubationStarted = performance.now();
          emitHud();
          return null;
        }
        if (cultureStep === 3 && hitRect(point, { x: 307, y: 230, w: 58, h: 178 })) {
          return { kind: "loop", loaded: false, label: "sterile loop", anchor: { x: 336, y: 270 } };
        }
        if (cultureStep === 4 && hitRect(point, { x: 307, y: 230, w: 58, h: 178 })) {
          return { kind: "loop", loaded: true, label: "loaded loop", anchor: { x: 336, y: 270 } };
        }
        if (cultureStep !== 0) return null;
        const colony = colonies.find(item => hitCircle(point, item));
        return colony ? { kind: "colony", id: colony.id, clean: colony.clean, label: colony.clean ? "isolated colony" : "neighbouring colony" } : null;
      }
      if (station === 1) {
        if (extractionStep === 0 && hitCircle(point, { x: 230, y: 311, r: 38 })) {
          extractionStep = 1;
          emitHud();
          return null;
        }
        if (extractionStep === 1 && hitCircle(point, { x: 470, y: 430, r: 48 })) {
          return { kind: "beads", label: "magnetic beads" };
        }
        if (extractionStep === 2 && bindingProgress >= 0.9 && hitRect(point, { x: 420, y: 220, w: 90, h: 155 })) {
          return { kind: "magnet", label: "magnet" };
        }
        if (extractionStep === 3 && hitCircle(point, { x: 276, y: 347, r: 30 })) {
          addRisk("Pipette touched the bead–DNA pellet");
          return null;
        }
        if (hitRect(point, { x: 182, y: 240, w: 94, h: 135 })) {
          if (extractionStep < 3) {
            addRisk("DNA lost: capture the bead–DNA complexes first");
            return null;
          }
          return { kind: "supernatant", label: "clear liquid" };
        }
      }
      if (station === 3) {
        const pieces = libraryPieces();
        const piece = pieces.find(item => hitCircle(point, item));
        return piece ? { kind: "library-piece", ...piece, label: piece.label } : null;
      }
      if (station === 4 && !sequencing && hitCircle(point, { x: 166, y: 432, r: 52 })) {
        return { kind: "prepared-library", label: "prepared library" };
      }
      return null;
    }

    function resolveDrop(source, point) {
      if (station === 0 && source.kind === "colony") {
        const onFreshPlate = hitCircle(point, { x: 455, y: 310, r: 105 });
        if (onFreshPlate && source.clean) {
          cultureStep = 1;
          emitHud();
        } else if (onFreshPlate) addRisk("Fresh plate contaminated by a neighbouring colony");
        else if (!hitCircle(point, { x: 160, y: 310, r: 136 })) addRisk("Colony dropped outside the fresh plate");
        else say("Move the isolated purple colony to the fresh plate", COLORS.gold);
      } else if (station === 0 && source.kind === "loop") {
        if (!source.loaded) {
          const colonyHit = transferColonies().some(item => hitCircle(point, { x: item[0], y: item[1], r: 18 }));
          if (colonyHit) {
            cultureStep = 4;
            say("Cells collected · now move the loop into the tube", COLORS.lime, 2800);
          } else if (hitCircle(point, { x: 165, y: 315, r: 112 })) {
            say("Touch one purple colony with the loop", COLORS.gold, 2800);
          } else {
            say("Move the sterile loop from its holder onto a colony", COLORS.gold, 2800);
          }
        } else if (hitRect(point, { x: 422, y: 250, w: 81, h: 150 })) {
          cultureStep = 5;
          transferStarted = performance.now();
          selected = null;
          say("Releasing cells from the loop into the tube…", COLORS.lime, 2200);
        } else {
          say("Place the loaded loop inside the tube liquid", COLORS.gold, 2800);
        }
      } else if (station === 1 && source.kind === "supernatant") {
        if (hitCircle(point, { x: 475, y: 470, r: 54 })) completeStation("Bead–DNA pellet retained for cleanup");
        else if (hitCircle(point, { x: 276, y: 347, r: 38 })) addRisk("Bead–DNA pellet aspirated with the liquid");
        else addRisk("Liquid spilled outside the waste cup");
      } else if (station === 1 && source.kind === "beads") {
        if (hitRect(point, { x: 182, y: 240, w: 94, h: 150 })) {
          extractionStep = 2;
          bindingProgress = 0;
          emitHud();
        } else {
          addRisk("Magnetic beads spilled");
        }
      } else if (station === 1 && source.kind === "magnet") {
        if (hitRect(point, { x: 298, y: 225, w: 92, h: 170 })) {
          magnetOn = true;
          extractionStep = 3;
          magnetProgress = 0;
          emitHud();
        } else {
          say("Place the magnet against the tube’s right wall", COLORS.gold, 2800);
        }
      } else if (station === 3 && source.kind === "library-piece") {
        if (!hitRect(point, { x: 145, y: 210, w: 310, h: 126 })) {
          addRisk("Library component dropped");
          return;
        }
        if (!source.correct) {
          addRisk("Index mismatch: choose the barcode for Sample K");
          return;
        }
        if (libraryStep === 0) {
          libraryStep = 1;
          selected = null;
          emitHud();
        } else {
          completeStation("Indexed library assembled");
        }
      } else if (station === 4 && source.kind === "prepared-library") {
        if (hitCircle(point, { x: 330, y: 285, r: 58 })) {
          sequencing = true;
          sequencingStarted = performance.now();
          selected = null;
          emitHud();
          vibrate([18, 35, 18]);
        } else {
          addRisk("Library spilled — release it inside the loading port");
        }
      }
    }

    function finishQcDispense() {
      if (!qcDispensing) return;
      qcDispensing = false;
      const concentration = qcConcentration();
      if (concentration >= 20 && concentration <= 30) {
        completeStation(`DNA normalized to ${concentration} ng/µL`);
      } else if (concentration > 30) {
        say(`Still ${concentration} ng/µL — add more buffer`, COLORS.gold, 2600);
      } else {
        addRisk("DNA over-diluted below 20 ng/µL");
        qcLevel = 0;
      }
    }

    function qcConcentration() {
      return Math.max(10, Math.round(80 - qcLevel * 80));
    }

    function libraryPieces() {
      if (libraryStep === 0) {
        return [
          { x: 300, y: 425, r: 48, label: "ADAPTERS", color: COLORS.violet, correct: true }
        ];
      }
      return [
        { x: 145, y: 425, r: 40, label: "INDEX M", color: COLORS.gold, correct: false },
        { x: 300, y: 425, r: 40, label: "INDEX K", color: COLORS.cyan, correct: true },
        { x: 455, y: 425, r: 40, label: "INDEX S", color: COLORS.blue, correct: false }
      ];
    }

    function nudge(direction) {
      if (state !== "playing" || stationComplete || sequencing) return;
      keyboardUsed = true;
      const amount = 24;
      if (direction === "up") cursor.y -= amount;
      if (direction === "down") cursor.y += amount;
      if (direction === "left") cursor.x -= amount;
      if (direction === "right") cursor.x += amount;
      cursor.x = clamp(cursor.x, 22, WORLD - 22);
      cursor.y = clamp(cursor.y, 82, WORLD - 28);
    }

    function act() {
      if (state !== "playing" || stationComplete || resetAt || sequencing) return;
      keyboardUsed = true;
      if (station === 2) {
        if (qcDispensing) finishQcDispense();
        else qcDispensing = true;
        return;
      }
      if (selected) {
        resolveDrop(selected, cursor);
        selected = null;
      } else {
        selected = sourceAt(cursor);
        if (selected) say(`Selected ${selected.label}. Move to destination + Space.`, COLORS.cyan, 2800);
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const size = rect.width || 600;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      scale = (size / WORLD) * dpr;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      draw(performance.now());
    }

    function draw(now) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, WORLD, WORLD);
      ctx.fillStyle = COLORS.bench;
      ctx.fillRect(0, 0, WORLD, WORLD);
      drawProgress();
      drawStationHeading();
      if (station === 0) drawColonyStation(now);
      if (station === 1) drawExtractionStation(now);
      if (station === 2) drawQcStation();
      if (station === 3) drawLibraryStation();
      if (station === 4) drawSequencingStation(now);
      drawMascot(now);
      drawDraggedItem();
      if (keyboardUsed && state === "playing") drawCursor();
      if (resetAt) drawResetWash();
    }

    function drawProgress() {
      ctx.save();
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(82, 43);
      ctx.lineTo(518, 43);
      ctx.stroke();
      STATIONS.forEach((item, index) => {
        const x = 82 + index * 109;
        const done = index < station;
        const active = index === station;
        ctx.fillStyle = done ? COLORS.lime : active ? COLORS.cyan : COLORS.panel;
        ctx.strokeStyle = active ? COLORS.paper : COLORS.line;
        ctx.lineWidth = active ? 3 : 2;
        circle(x, 43, active ? 17 : 14, true, true);
        ctx.fillStyle = done || active ? COLORS.ink : COLORS.muted;
        text(done ? "✓" : String(index + 1), x, 44, 12, 900, "center");
        ctx.fillStyle = active ? COLORS.paper : COLORS.muted;
        text(item.short, x, 70, 11, active ? 900 : 700, "center");
      });
      ctx.restore();
    }

    function drawStationHeading() {
      ctx.fillStyle = COLORS.cyan;
      text(`STATION ${station + 1} OF ${TOTAL_STATIONS}`, 38, 108, 12, 900);
      ctx.fillStyle = COLORS.paper;
      text(STATIONS[station].name, 38, 136, 25, 950);
    }

    function drawColonyStation(now) {
      drawCultureSteps();
      if (cultureStep >= 3) {
        drawCultureTransfer(now);
        return;
      }
      ctx.fillStyle = "#263139";
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 4;
      circle(160, 310, 136, true, true);
      ctx.strokeStyle = "rgba(255,255,255,.14)";
      ctx.lineWidth = 2;
      circle(160, 310, 123, false, true);
      colonies.forEach(colony => drawColony(colony, now));

      ctx.fillStyle = "#263139";
      ctx.strokeStyle = cultureStep >= 1 ? COLORS.violet : COLORS.blue;
      ctx.lineWidth = 4;
      circle(455, 310, 105, true, true);
      ctx.strokeStyle = "rgba(255,255,255,.13)";
      ctx.lineWidth = 2;
      circle(455, 310, 93, false, true);

      if (cultureStep === 0) {
        ctx.fillStyle = COLORS.blue;
        text("FRESH", 455, 302, 14, 950, "center");
        text("PLATE", 455, 322, 14, 950, "center");
      } else {
        ctx.strokeStyle = COLORS.violet;
        ctx.lineWidth = 8;
        for (let line = 0; line < 4; line += 1) {
          const y = 265 + line * 28;
          ctx.beginPath();
          ctx.moveTo(398, y);
          ctx.bezierCurveTo(430, y - 18, 468, y + 18, 510, y);
          ctx.stroke();
        }
      }

      if (cultureStep === 2) {
        const growth = Math.min(1, (now - incubationStarted) / 2600);
        const pureColonies = [[420, 273], [467, 270], [494, 312], [449, 331], [409, 337], [479, 359]];
        pureColonies.forEach((position, index) => {
          const radius = Math.max(0, growth * (10 + index % 3 * 2));
          ctx.fillStyle = COLORS.violet;
          ctx.strokeStyle = COLORS.lime;
          ctx.lineWidth = 2;
          circle(position[0], position[1], radius, true, growth > 0.25);
        });
        ctx.fillStyle = COLORS.lime;
        text("ONE COLONY TYPE", 455, 397, 10, 950, "center");
      }

      if (cultureStep === 1) {
        ctx.fillStyle = COLORS.lime;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 3;
        circle(455, 465, 45, true, true);
        ctx.fillStyle = COLORS.ink;
        text("INCUBATE", 455, 458, 11, 950, "center");
        text("GROW PURE", 455, 475, 9, 900, "center");
      }

      ctx.fillStyle = COLORS.muted;
      text("SOURCE PLATE", 160, 465, 10, 850, "center");
    }

    function drawCultureSteps() {
      const labels = ["PICK", "STREAK", "GROW", "COLLECT", "TUBE"];
      const completedSteps = cultureStep === 0 ? 0 : cultureStep === 1 ? 2 : cultureStep === 2 ? 2 : cultureStep;
      const startX = 77;
      const gap = 112;
      labels.forEach((label, index) => {
        const x = startX + gap * index;
        const done = index < completedSteps;
        const active = index === completedSteps;
        ctx.fillStyle = done ? COLORS.lime : active ? COLORS.cyan : COLORS.muted;
        text(`${done ? "✓" : index + 1} ${label}`, x, 166, 9, active ? 950 : 800, "center");
        if (index < labels.length - 1) {
          ctx.fillStyle = COLORS.line;
          text("›", x + gap / 2, 166, 13, 900, "center");
        }
      });
    }

    function transferColonies() {
      return [[132, 278], [183, 269], [213, 311], [173, 335], [119, 345], [191, 379]];
    }

    function drawCultureTransfer(now) {
      ctx.fillStyle = "#263139";
      ctx.strokeStyle = COLORS.violet;
      ctx.lineWidth = 4;
      circle(165, 315, 112, true, true);
      ctx.strokeStyle = "rgba(255,255,255,.14)";
      ctx.lineWidth = 2;
      circle(165, 315, 100, false, true);
      transferColonies().forEach((position, index) => {
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = index === 2 && cultureStep === 3 ? COLORS.lime : "rgba(255,255,255,.48)";
        ctx.lineWidth = index === 2 && cultureStep === 3 ? 3 : 2;
        circle(position[0], position[1], 12 + index % 2 * 2, true, true);
      });
      ctx.fillStyle = COLORS.lime;
      text("PURE CULTURE", 165, 455, 11, 950, "center");

      drawTube(410, 215, 105, 225, COLORS.cyan);
      ctx.fillStyle = "rgba(108,169,255,.34)";
      roundRect(422, 250, 81, 150, 15, true, false);
      if (cultureStep === 5) drawCellRelease(now);
      ctx.fillStyle = COLORS.cyan;
      text("EXTRACTION TUBE", 462, 465, 10, 950, "center");

      if (cultureStep < 5) {
        if (!drag || drag.source.kind !== "loop") drawInoculatingLoop(336, 270, cultureStep === 4);
        ctx.fillStyle = cultureStep === 4 ? COLORS.lime : COLORS.paper;
        text(cultureStep === 4 ? "CELLS ON LOOP" : "STERILE LOOP", 336, 430, 10, 950, "center");
      } else {
        ctx.fillStyle = COLORS.lime;
        text(stationComplete ? "CELLS IN TUBE" : "RELEASING CELLS", 336, 430, 10, 950, "center");
      }
    }

    function drawCellRelease(now) {
      const progress = Math.min(1, Math.max(0, (now - transferStarted) / 1800));
      ctx.save();
      ctx.translate(462, 302);
      ctx.rotate(Math.PI);
      drawInoculatingLoop(0, 0, false);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = COLORS.violet;
      circle(462, 302, 9 * (1 - progress), true, false);
      ctx.restore();

      const releasedCells = [[442, 332], [473, 344], [454, 365], [486, 376], [434, 386]];
      releasedCells.forEach((position, index) => {
        const reveal = Math.min(1, Math.max(0, progress * 1.7 - index * 0.13));
        ctx.save();
        ctx.globalAlpha = reveal;
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 1.5;
        circle(position[0], position[1], 5 + reveal * 2, true, true);
        ctx.restore();
      });
    }

    function drawInoculatingLoop(x, y, loaded) {
      ctx.save();
      ctx.strokeStyle = COLORS.paper;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, 21, 0, Math.PI * 2);
      ctx.moveTo(x, y + 21);
      ctx.lineTo(x, y + 92);
      ctx.stroke();
      ctx.fillStyle = COLORS.cyan;
      roundRect(x - 10, y + 86, 20, 38, 8, true, false);
      if (loaded) {
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = COLORS.lime;
        ctx.lineWidth = 2;
        circle(x, y, 12, true, true);
      }
      ctx.restore();
    }

    function drawColony(colony, now) {
      const pulse = colony.clean && !reducedMotion ? Math.sin(now / 260) * 3 : 0;
      const color = colony.clean ? COLORS.violet : COLORS.coral;
      ctx.save();
      ctx.globalAlpha = colony.clean ? 1 : 0.78;
      ctx.fillStyle = color;
      ctx.strokeStyle = colony.clean ? COLORS.lime : "rgba(255,255,255,.25)";
      ctx.lineWidth = colony.clean ? 4 : 2;
      circle(colony.x, colony.y, colony.r + pulse, true, true);
      ctx.fillStyle = "rgba(255,255,255,.52)";
      circle(colony.x - 6, colony.y - 7, 5, true, false);
      ctx.restore();
      if (colony.clean) {
        ctx.fillStyle = COLORS.lime;
        text("PICK ME", colony.x, colony.y + 43, 11, 950, "center");
      }
    }

    function drawExtractionStation(now) {
      drawExtractionSteps();
      drawTube(170, 205, 120, 225, COLORS.blue);
      ctx.fillStyle = "rgba(108,169,255,.34)";
      roundRect(182, 248, 96, 154, 16, true, false);

      if (extractionStep === 0) {
        const pulse = reducedMotion ? 0 : Math.sin(now / 250) * 2;
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = COLORS.lime;
        ctx.lineWidth = 3;
        roundRect(203 - pulse, 275 - pulse, 54 + pulse * 2, 72 + pulse * 2, 27, true, true);
        ctx.fillStyle = COLORS.ink;
        circle(220, 306, 4, true, false);
        circle(239, 306, 4, true, false);
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(230, 318, 10, 0.12, Math.PI - 0.12);
        ctx.stroke();
        ctx.fillStyle = COLORS.lime;
        text("TAP TO LYSE", 230, 371, 11, 950, "center");
      } else {
        drawDnaBeadComplexes();
      }

      ctx.fillStyle = COLORS.paper;
        text(extractionStep === 0 ? "CULTURED CELLS" : extractionStep === 1 ? "RELEASED DNA" : "BEAD–DNA", 230, 258, 12, 900, "center");
      ctx.fillStyle = COLORS.muted;
      if (extractionStep === 2) text(bindingProgress < 0.9 ? "DNA moving onto beads" : "Complexes ready", 230, 392, 10, 750, "center");
      if (extractionStep === 3) text("AT RIGHT WALL", 230, 392, 10, 850, "center");

      if (extractionStep === 1) {
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 3;
        circle(470, 430, 48, true, true);
        for (let index = 0; index < 8; index += 1) {
          const angle = index / 8 * Math.PI * 2;
          ctx.fillStyle = COLORS.paper;
          circle(470 + Math.cos(angle) * 22, 430 + Math.sin(angle) * 22, 4, true, false);
        }
        ctx.fillStyle = COLORS.ink;
        text("BEADS", 470, 430, 11, 950, "center");
        ctx.fillStyle = COLORS.violet;
        text("ADD TO DNA", 470, 490, 11, 950, "center");
      }

      if (extractionStep === 2 && bindingProgress >= 0.9) {
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 3;
        roundRect(298, 225, 92, 170, 18, false, true);
        ctx.fillStyle = COLORS.cyan;
        text("RIGHT SIDE", 344, 414, 10, 950, "center");
        if (!drag || drag.source.kind !== "magnet") drawMagnet(420, 220, 90, 155, false);
      }

      if (extractionStep === 3) {
        drawMagnet(300, 230, 86, 155, true);
        if (!drag || drag.source.kind !== "supernatant") drawPipette(205, 342);
        ctx.fillStyle = "#323944";
        ctx.strokeStyle = COLORS.coral;
        ctx.lineWidth = 3;
        circle(475, 470, 54, true, true);
        ctx.fillStyle = COLORS.coral;
        text("WASTE", 475, 470, 13, 950, "center");
        ctx.fillStyle = COLORS.cyan;
        text("DRAG PIPETTE → WASTE", 230, 448, 10, 950, "center");
      }
    }

    function drawDnaBeadComplexes() {
      const binding = extractionStep >= 2 ? bindingProgress : 0;
      const magnetic = extractionStep >= 3 ? magnetProgress : 0;
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 4;
      for (let strand = 0; strand < 3; strand += 1) {
        const freeY = 282 + strand * 41;
        const boundY = 310 + strand * 24;
        const y = lerp(freeY, boundY, binding);
        const startX = lerp(190, lerp(200, 258, magnetic), binding);
        const endX = lerp(270, lerp(270, 280, magnetic), binding);
        const amplitude = lerp(16, 4, binding);
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.bezierCurveTo(lerp(startX, endX, .33), y - amplitude, lerp(startX, endX, .67), y + amplitude, endX, y);
        ctx.stroke();
      }

      if (extractionStep >= 2) {
        for (let index = 0; index < 18; index += 1) {
          const freeX = 192 + (index % 6) * 15;
          const freeY = 302 + Math.floor(index / 6) * 26;
          const boundX = 202 + (index % 6) * 13;
          const boundY = 307 + Math.floor(index / 6) * 24;
          const capturedX = 264 + (index % 3) * 6;
          const capturedY = 292 + Math.floor(index / 3) * 15;
          const x = lerp(lerp(freeX, boundX, binding), capturedX, magnetic);
          const y = lerp(lerp(freeY, boundY, binding), capturedY, magnetic);
          ctx.fillStyle = COLORS.violet;
          ctx.strokeStyle = COLORS.gold;
          ctx.lineWidth = 1.5;
          circle(x, y, 5, true, binding > 0.15);
        }
      }
    }

    function drawMagnet(x, y, width, height, active) {
      ctx.fillStyle = active ? COLORS.lime : COLORS.coral;
      roundRect(x, y, width, height, 18, true, false);
      ctx.fillStyle = COLORS.ink;
      roundRect(x + 18, y + 26, width - 36, height - 52, 9, true, false);
      ctx.fillStyle = COLORS.paper;
      text("MAGNET", x + width / 2, y + height / 2, 13, 950, "center");
    }

    function drawPipette(x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = COLORS.paper;
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      roundRect(-12, -72, 24, 52, 7, true, true);
      ctx.fillStyle = COLORS.blue;
      roundRect(-7, -57, 14, 34, 5, true, false);
      ctx.beginPath();
      ctx.moveTo(-6, -20);
      ctx.lineTo(0, 3);
      ctx.lineTo(6, -20);
      ctx.closePath();
      ctx.fillStyle = COLORS.paper;
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.stroke();
      ctx.fillStyle = COLORS.blue;
      circle(0, 7, 7, true, false);
      ctx.restore();
    }

    function drawExtractionSteps() {
      const labels = ["LYSE", "BIND", "CAPTURE", "CLEANUP"];
      const startX = 105;
      const gap = 130;
      ctx.save();
      labels.forEach((label, index) => {
        const x = startX + gap * index;
        const done = index < extractionStep;
        const active = index === extractionStep;
        ctx.fillStyle = done ? COLORS.lime : active ? COLORS.cyan : COLORS.muted;
        text(`${done ? "✓" : index + 1} ${label}`, x, 166, 9, active ? 950 : 800, "center");
        if (index < labels.length - 1) {
          ctx.fillStyle = COLORS.line;
          text("›", x + gap / 2, 166, 13, 900, "center");
        }
      });
      ctx.restore();
    }

    function drawQcStation() {
      const concentration = qcConcentration();
      ctx.fillStyle = COLORS.muted;
      text("CURRENT DNA CONCENTRATION", 300, 190, 11, 900, "center");
      ctx.fillStyle = concentration >= 20 && concentration <= 30 ? COLORS.lime : COLORS.paper;
      text(`${concentration} ng/µL`, 300, 225, 30, 950, "center");
      ctx.fillStyle = COLORS.lime;
      text("LIBRARY INPUT GOAL  20–30 ng/µL", 300, 258, 12, 900, "center");

      const gauge = { x: 105, y: 286, w: 390, h: 42 };
      ctx.fillStyle = COLORS.panel;
      roundRect(gauge.x, gauge.y, gauge.w, gauge.h, 21, true, false);
      ctx.fillStyle = "#333a45";
      roundRect(gauge.x + 10, gauge.y + 10, gauge.w - 20, gauge.h - 20, 11, true, false);
      ctx.fillStyle = COLORS.lime;
      roundRect(gauge.x + gauge.w * 0.625, gauge.y + 6, gauge.w * 0.125, gauge.h - 12, 15, true, false);
      const needleX = gauge.x + 10 + qcLevel * (gauge.w - 20);
      ctx.fillStyle = COLORS.paper;
      roundRect(needleX - 4, gauge.y - 7, 8, gauge.h + 14, 4, true, false);
      ctx.fillStyle = COLORS.muted;
      text("80  CONCENTRATED", gauge.x + 8, gauge.y + 66, 10, 800);
      ctx.fillStyle = COLORS.lime;
      text("TARGET", gauge.x + gauge.w * 0.69, gauge.y + 66, 10, 950, "center");
      ctx.fillStyle = COLORS.muted;
      text("TOO DILUTE", gauge.x + gauge.w - 8, gauge.y + 84, 10, 800, "right");

      ctx.fillStyle = qcDispensing ? COLORS.cyan : COLORS.violet;
      ctx.strokeStyle = COLORS.paper;
      ctx.lineWidth = 3;
      circle(300, 440, 61, true, true);
      ctx.fillStyle = COLORS.ink;
      text(qcDispensing ? "RELEASE" : "HOLD", 300, 430, 15, 950, "center");
      text(qcDispensing ? "AT 20–30" : "ADD BUFFER", 300, 452, 10, 900, "center");
    }

    function drawLibraryStation() {
      const stepLabels = libraryStep === 0
        ? [{ label: "1  LIGATE ADAPTERS", active: true }, { label: "2  INDEX PCR", active: false }]
        : [{ label: "✓  ADAPTERS ATTACHED", active: false }, { label: "2  INDEX PCR", active: true }];
      stepLabels.forEach((item, index) => {
        ctx.fillStyle = item.active ? COLORS.cyan : index < libraryStep + 1 ? COLORS.lime : COLORS.muted;
        text(item.label, index === 0 ? 190 : 410, 176, 10, item.active ? 950 : 800, "center");
      });

      ctx.fillStyle = COLORS.panel;
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 3;
      roundRect(145, 210, 310, 126, 24, true, true);
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(205, 273);
      ctx.bezierCurveTo(250, 231, 348, 315, 395, 273);
      ctx.stroke();
      if (libraryStep >= 1) {
        ctx.fillStyle = COLORS.violet;
        roundRect(177, 250, 28, 46, 7, true, false);
        roundRect(395, 250, 28, 46, 7, true, false);
      }
      ctx.fillStyle = COLORS.paper;
      text(libraryStep === 0 ? "DNA FRAGMENT · EMPTY ENDS" : "ADAPTERS = SEQUENCING HANDLES", 300, 350, 11, 900, "center");
      if (libraryStep >= 1) {
        ctx.fillStyle = COLORS.violet;
        text("SOURCE SAMPLE: K", 300, 369, 11, 850, "center");
      }

      libraryPieces().forEach(piece => {
        ctx.fillStyle = piece.color;
        ctx.strokeStyle = selected && selected.label === piece.label ? COLORS.paper : "rgba(255,255,255,.24)";
        ctx.lineWidth = selected && selected.label === piece.label ? 4 : 2;
        circle(piece.x, piece.y, piece.r, true, true);
        ctx.fillStyle = COLORS.ink;
        text(piece.label, piece.x, piece.y, piece.label === "ADAPTERS" ? 12 : 10, 950, "center");
      });
    }

    function drawSequencingStation(now) {
      ctx.fillStyle = "#303743";
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 4;
      roundRect(190, 182, 340, 220, 32, true, true);
      ctx.fillStyle = COLORS.ink;
      roundRect(218, 210, 284, 144, 18, true, false);

      if (!sequencing) {
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 4;
        circle(330, 285, 58, false, true);
        ctx.fillStyle = COLORS.cyan;
        text("LOAD PORT", 330, 280, 12, 950, "center");
        ctx.fillStyle = COLORS.muted;
        text("FLOW CELL", 330, 301, 10, 850, "center");
      } else {
        drawReads(now);
      }

      if (!sequencing) {
        drawTube(120, 382, 92, 116, COLORS.violet);
        ctx.fillStyle = COLORS.violet;
        text("PREPARED", 166, 418, 10, 950, "center");
        text("LIBRARY", 166, 436, 11, 950, "center");
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(224, 420);
        ctx.lineTo(360, 420);
        ctx.lineTo(360, 373);
        ctx.stroke();
        ctx.fillStyle = COLORS.cyan;
        ctx.beginPath();
        ctx.moveTo(349, 382);
        ctx.lineTo(360, 365);
        ctx.lineTo(371, 382);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 3;
        circle(166, 440, 55, true, true);
        ctx.fillStyle = COLORS.ink;
        text("RUNNING", 166, 434, 13, 950, "center");
        text("READS", 166, 454, 10, 900, "center");
      }
    }

    function drawReads(now) {
      const bases = ["A", "C", "G", "T"];
      const colors = [COLORS.cyan, COLORS.blue, COLORS.gold, COLORS.coral];
      const elapsed = Math.max(0, now - sequencingStarted);
      const revealed = Math.min(28, Math.floor(elapsed / 70));
      ctx.fillStyle = COLORS.lime;
      text("CLEAN READS", 360, 238, 14, 950, "center");
      for (let index = 0; index < revealed; index += 1) {
        const row = Math.floor(index / 14);
        const column = index % 14;
        ctx.fillStyle = colors[index % colors.length];
        text(bases[index % bases.length], 243 + column * 18, 275 + row * 30, 14, 950, "center");
      }
      const progress = Math.min(1, elapsed / 3000);
      ctx.fillStyle = "#343b46";
      roundRect(240, 330, 240, 10, 5, true, false);
      ctx.fillStyle = COLORS.lime;
      roundRect(240, 330, 240 * progress, 10, 5, true, false);
    }

    function drawMascot(now) {
      if (!image || !image.complete || image.naturalWidth === 0) return;
      const bob = reducedMotion ? 0 : Math.sin(now / 320) * 3;
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.drawImage(image, 494, 91 + bob, 72, 72);
      ctx.restore();
    }

    function drawDraggedItem() {
      if (!drag) return;
      const point = drag.point;
      if (drag.source.kind === "colony") {
        ctx.fillStyle = drag.source.clean ? COLORS.violet : COLORS.coral;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 3;
        circle(point.x, point.y, 23, true, true);
      } else if (drag.source.kind === "loop") {
        drawInoculatingLoop(point.x - drag.grabOffset.x, point.y - drag.grabOffset.y, drag.source.loaded);
      } else if (drag.source.kind === "supernatant") {
        drawPipette(point.x, point.y);
      } else if (drag.source.kind === "beads") {
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 3;
        circle(point.x, point.y, 31, true, true);
        for (let index = 0; index < 7; index += 1) {
          const angle = index / 7 * Math.PI * 2;
          ctx.fillStyle = COLORS.paper;
          circle(point.x + Math.cos(angle) * 15, point.y + Math.sin(angle) * 15, 3, true, false);
        }
      } else if (drag.source.kind === "magnet") {
        drawMagnet(point.x - 40, point.y - 65, 80, 130, false);
      } else if (drag.source.kind === "library-piece") {
        ctx.fillStyle = drag.source.color;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 3;
        circle(point.x, point.y, 40, true, true);
        ctx.fillStyle = COLORS.ink;
        text(drag.source.label, point.x, point.y, 10, 950, "center");
      } else if (drag.source.kind === "prepared-library") {
        ctx.fillStyle = COLORS.violet;
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 3;
        circle(point.x, point.y, 34, true, true);
        ctx.fillStyle = COLORS.ink;
        text("LIBRARY", point.x, point.y, 10, 950, "center");
      }
    }

    function drawCursor() {
      ctx.save();
      ctx.strokeStyle = COLORS.paper;
      ctx.lineWidth = 3;
      circle(cursor.x, cursor.y, 17, false, true);
      ctx.beginPath();
      ctx.moveTo(cursor.x - 24, cursor.y);
      ctx.lineTo(cursor.x + 24, cursor.y);
      ctx.moveTo(cursor.x, cursor.y - 24);
      ctx.lineTo(cursor.x, cursor.y + 24);
      ctx.stroke();
      ctx.restore();
    }

    function drawResetWash() {
      ctx.save();
      ctx.fillStyle = "rgba(255,117,149,.12)";
      ctx.fillRect(0, 0, WORLD, WORLD);
      ctx.restore();
    }

    function drawTube(x, y, width, height, color) {
      ctx.fillStyle = COLORS.panel;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      roundRect(x, y, width, height, 24, true, true);
      ctx.fillStyle = color;
      roundRect(x - 8, y - 12, width + 16, 34, 11, true, false);
      ctx.fillStyle = "rgba(255,255,255,.08)";
      roundRect(x + 15, y + 38, width - 30, height - 62, 15, true, false);
    }

    function eventPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp((event.clientX - rect.left) / rect.width * WORLD, 0, WORLD),
        y: clamp((event.clientY - rect.top) / rect.height * WORLD, 0, WORLD)
      };
    }

    function hitCircle(point, item) {
      return Math.hypot(point.x - item.x, point.y - item.y) <= item.r;
    }

    function hitRect(point, rect) {
      return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
    }

    function roundRect(x, y, width, height, radius, fill, stroke) {
      const safe = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + safe, y);
      ctx.lineTo(x + width - safe, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + safe);
      ctx.lineTo(x + width, y + height - safe);
      ctx.quadraticCurveTo(x + width, y + height, x + width - safe, y + height);
      ctx.lineTo(x + safe, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - safe);
      ctx.lineTo(x, y + safe);
      ctx.quadraticCurveTo(x, y, x + safe, y);
      ctx.closePath();
      if (fill) ctx.fill();
      if (stroke) ctx.stroke();
    }

    function circle(x, y, radius, fill, stroke) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      if (fill) ctx.fill();
      if (stroke) ctx.stroke();
    }

    function text(value, x, y, size, weight, align = "left") {
      const readableSize = size <= 12 ? size * 1.5 : size;
      ctx.font = `${weight} ${readableSize}px ui-rounded, "Arial Rounded MT Bold", Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(value, x, y);
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function lerp(start, end, amount) {
      return start + (end - start) * amount;
    }

    function vibrate(pattern) {
      if ("vibrate" in navigator && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
        navigator.vibrate(pattern);
      }
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);

    return { start, pause, resume, resize, destroy, nudge, act, getState: () => state };
  };
})();
