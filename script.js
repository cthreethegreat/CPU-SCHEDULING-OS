/*
  ============================================================
  FILE MAP
  1. Process-queue builder (Enqueue / Dequeue / Generate Random)
  2. The five scheduling algorithms (identical logic to the earlier
     version — each returns {schedule, processes} where `schedule`
     is a list of {id, start, end[, level]} blocks)
  3. expandToTicks() — turns those blocks into a "1 entry per second"
     array, which is what actually drives the live animation
  4. The animation loop — walks through the ticks one at a time on
     a timer, updating the live table, Gantt chart, and stats as it
     goes, instead of drawing the final answer instantly
  ============================================================
*/

const colors = ["#2f6fed", "#0f9d78", "#e08e2b", "#b23a6b", "#d1495b", "#1b998b", "#c9a227", "#5b6472"]; // professional categorical palette

// ---------- PROCESS QUEUE STATE ----------
// Each entry: {id, arrival, burst}
let queue = [];
let idCounter = 0;

function addProcess() {
  const arrival = parseInt(document.getElementById("arrivalInput").value);
  const burst = parseInt(document.getElementById("burstInput").value);
  if (isNaN(arrival) || isNaN(burst) || burst < 1) {
    setMessage("Arrival and Exec. Time must be valid numbers (burst \u2265 1).", true);
    return;
  }
  idCounter++;
  queue.push({ id: "P" + idCounter, arrival, burst });
  renderQueueTable();
  setMessage("No Errors.");
}

function removeLastProcess() {
  queue.pop();
  renderQueueTable();
}

function clearAllProcesses() {
  queue = [];
  idCounter = 0;
  renderQueueTable();
}

// Fills the queue with N random processes. Arrival is spread out (0-9)
// so you actually see idle gaps and overlaps; burst is 1-8.
function generateRandom() {
  const count = parseInt(document.getElementById("randomCount").value) || 1;
  for (let i = 0; i < count; i++) {
    idCounter++;
    queue.push({
      id: "P" + idCounter,
      arrival: Math.floor(Math.random() * 10),
      burst: Math.floor(Math.random() * 8) + 1
    });
  }
  renderQueueTable();
  setMessage("No Errors.");
}

function renderQueueTable() {
  const body = document.getElementById("processTableBody");
  body.innerHTML = "";
  queue.forEach((p, i) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${i + 1}</td><td>${p.id}</td><td>${p.arrival}</td><td>${p.burst}</td>
      <td><button class="danger" style="padding:2px 8px;" onclick="removeAt(${i})">x</button></td>`;
    body.appendChild(row);
  });
}

function removeAt(i) {
  queue.splice(i, 1);
  renderQueueTable();
}

function setMessage(msg, isError = false) {
  const el = document.getElementById("actionMsg");
  el.textContent = msg;
  el.className = "action-msg" + (isError ? " error" : "");
}

function onAlgoChange() {
  const algo = document.getElementById("algoSelect").value;
  const paramRow = document.getElementById("paramRow");
  const allotmentField = document.getElementById("allotmentField");
  if (algo === "rr" || algo === "mlfq") paramRow.classList.remove("hidden");
  else paramRow.classList.add("hidden");
  if (algo === "mlfq") allotmentField.classList.remove("hidden");
  else allotmentField.classList.add("hidden");
}


/* ============================================================
   THE FIVE ALGORITHMS
   (Same logic as the earlier tool — see previous explanation for
   the reasoning behind each one. Each takes a plain array of
   {id, arrival, burst, remaining} and returns filled-in metrics
   plus a `schedule` of {id, start, end[, level]} blocks.)
   ============================================================ */

function runFCFS(processes) {
  processes.sort((a, b) => a.arrival - b.arrival);
  let time = 0, schedule = [];
  processes.forEach(p => {
    if (time < p.arrival) time = p.arrival;
    const start = time, end = start + p.burst;
    p.start = start; p.completion = end;
    p.turnaround = p.completion - p.arrival;
    p.response = start - p.arrival;
    schedule.push({ id: p.id, start, end });
    time = end;
  });
  return { schedule, processes };
}

function runSJF(processes) {
  let time = 0, done = 0, schedule = [];
  const n = processes.length;
  while (done < n) {
    const available = processes.filter(p => p.arrival <= time && p.completion === undefined);
    if (available.length === 0) {
      const notDone = processes.filter(p => p.completion === undefined);
      time = Math.min(...notDone.map(p => p.arrival));
      continue;
    }
    available.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival);
    const p = available[0];
    const start = time, end = start + p.burst;
    p.start = start; p.completion = end;
    p.turnaround = p.completion - p.arrival;
    p.response = start - p.arrival;
    schedule.push({ id: p.id, start, end });
    time = end; done++;
  }
  return { schedule, processes };
}

function runSRTF(processes) {
  let time = 0, done = 0, schedule = [];
  const n = processes.length;
  while (done < n) {
    const available = processes.filter(p => p.arrival <= time && p.remaining > 0);
    if (available.length === 0) {
      const notDone = processes.filter(p => p.remaining > 0);
      time = Math.min(...notDone.map(p => p.arrival));
      continue;
    }
    available.sort((a, b) => a.remaining - b.remaining || a.arrival - b.arrival);
    const p = available[0];
    if (p.start === undefined) p.start = time;
    p.remaining -= 1; time += 1;
    const last = schedule[schedule.length - 1];
    if (last && last.id === p.id && last.end === time - 1) last.end = time;
    else schedule.push({ id: p.id, start: time - 1, end: time });
    if (p.remaining === 0) {
      p.completion = time;
      p.turnaround = p.completion - p.arrival;
      p.response = p.start - p.arrival;
      done++;
    }
  }
  return { schedule, processes };
}

function runRoundRobin(processes, quantum) {
  processes.sort((a, b) => a.arrival - b.arrival);
  let time = 0, done = 0, arrivalPointer = 0, queueRR = [], schedule = [];
  const n = processes.length;
  function admitArrivals(t) {
    while (arrivalPointer < n && processes[arrivalPointer].arrival <= t) {
      queueRR.push(processes[arrivalPointer]); arrivalPointer++;
    }
  }
  let running = null, quantumUsed = 0;
  admitArrivals(time);
  while (done < n) {
    if (running === null) {
      if (queueRR.length === 0) { time = processes[arrivalPointer].arrival; admitArrivals(time); }
      running = queueRR.shift(); quantumUsed = 0;
      if (running.start === undefined) running.start = time;
    }
    running.remaining -= 1; quantumUsed += 1; time += 1;
    const last = schedule[schedule.length - 1];
    if (last && last.id === running.id && last.end === time - 1) last.end = time;
    else schedule.push({ id: running.id, start: time - 1, end: time });
    admitArrivals(time);
    if (running.remaining === 0) {
      running.completion = time;
      running.turnaround = running.completion - running.arrival;
      running.response = running.start - running.arrival;
      done++; running = null;
    } else if (quantumUsed === quantum) { queueRR.push(running); running = null; }
  }
  return { schedule, processes };
}

function runMLFQ(processes, quantum, allotment) {
  processes.sort((a, b) => a.arrival - b.arrival);
  const n = processes.length;
  let time = 0, done = 0, arrivalPointer = 0;
  let queues = [[], [], [], []], schedule = [];
  processes.forEach(p => { p.level = 0; p.timeAtLevel = 0; });
  function admitArrivals(t) {
    while (arrivalPointer < n && processes[arrivalPointer].arrival <= t) {
      processes[arrivalPointer].level = 0;
      queues[0].push(processes[arrivalPointer]); arrivalPointer++;
    }
  }
  let running = null, runLevel = null, quantumUsed = 0;
  admitArrivals(time);
  while (done < n) {
    if (running === null) {
      let lvl = queues.findIndex(q => q.length > 0);
      if (lvl === -1) { time = processes[arrivalPointer].arrival; admitArrivals(time); continue; }
      running = queues[lvl].shift(); runLevel = lvl; quantumUsed = 0;
      if (running.start === undefined) running.start = time;
    }
    running.remaining -= 1; running.timeAtLevel += 1; quantumUsed += 1; time += 1;
    const last = schedule[schedule.length - 1];
    if (last && last.id === running.id && last.level === runLevel && last.end === time - 1) last.end = time;
    else schedule.push({ id: running.id, start: time - 1, end: time, level: runLevel });
    admitArrivals(time);
    if (running.remaining === 0) {
      running.completion = time;
      running.turnaround = running.completion - running.arrival;
      running.response = running.start - running.arrival;
      done++; running = null;
    } else if (running.timeAtLevel >= allotment && runLevel < 3) {
      runLevel += 1; running.timeAtLevel = 0; running.level = runLevel;
      queues[runLevel].push(running); running = null;
    } else if (quantumUsed === quantum) {
      queues[runLevel].push(running); running = null;
    }
  }
  return { schedule, processes };
}


/* ============================================================
   EXPAND A SCHEDULE INTO A "ONE SLOT PER SECOND" TIMELINE
   This is the key step for animation: instead of drawing the
   whole final Gantt chart instantly, we need to know exactly
   who is running at second 0, second 1, second 2, etc. so we can
   reveal one box at a time. `null` means the CPU was idle that
   second (nobody had arrived yet, or everyone was already done).
   ============================================================ */
function expandToTicks(schedule) {
  const totalTicks = schedule.length ? schedule[schedule.length - 1].end : 0;
  const ticks = new Array(totalTicks).fill(null);
  schedule.forEach(block => {
    for (let t = block.start; t < block.end; t++) ticks[t] = block.id;
  });
  return ticks;
}


/* ============================================================
   ANIMATION STATE + LOOP
   ============================================================ */
let simTimer = null;
let simTicks = [];
let simProcesses = [];
let simIndex = 0;   // which second we're currently revealing

function resetSimulation() {
  if (simTimer) clearInterval(simTimer);
  simTimer = null;
  simTicks = [];
  simIndex = 0;
  document.getElementById("ganttChart").innerHTML = "";
  document.getElementById("liveTableBody").innerHTML = "";
  document.getElementById("avgWaiting").textContent = "--";
  document.getElementById("avgTurnaround").textContent = "--";
  document.getElementById("totalExec").textContent = "--";
  document.getElementById("cpuNow").textContent = "--";
  document.getElementById("nextQueue").textContent = "--";
  document.getElementById("progressBar").style.width = "0%";
  document.getElementById("progressPct").textContent = "0%";
  document.getElementById("simulateBtn").disabled = false;
  setMessage("No Errors.");
}

function startSimulation() {
  if (queue.length === 0) {
    setMessage("Add at least one process before simulating.", true);
    return;
  }
  resetSimulation();

  // deep-copy the queue so the original inputs are untouched, and give
  // every process a `remaining` counter, which only the algorithm functions use
  const processes = queue.map(p => ({ ...p, remaining: p.burst }));

  const algo = document.getElementById("algoSelect").value;
  let result;
  if (algo === "fcfs") result = runFCFS(processes);
  else if (algo === "sjf") result = runSJF(processes);
  else if (algo === "srtf") result = runSRTF(processes);
  else if (algo === "rr") result = runRoundRobin(processes, parseInt(document.getElementById("quantum").value));
  else result = runMLFQ(processes, parseInt(document.getElementById("quantum").value), parseInt(document.getElementById("allotment").value));

  simProcesses = result.processes;
  simTicks = expandToTicks(result.schedule);
  simIndex = 0;

  document.getElementById("simulateBtn").disabled = true;

  const speedLevel = parseInt(document.getElementById("speedSlider").value);
  const delay = 1000 - speedLevel * 45;   // slider 1 (slow, 955ms/tick) -> 20 (fast, 100ms/tick)

  simTimer = setInterval(stepSimulation, Math.max(delay, 60));
}

document.getElementById("speedSlider").addEventListener("input", () => {
  const level = document.getElementById("speedSlider").value;
  document.getElementById("speedLabel").textContent = "x" + level;
  // if a simulation is running, apply the new speed immediately
  if (simTimer) {
    clearInterval(simTimer);
    const delay = 1000 - level * 45;
    simTimer = setInterval(stepSimulation, Math.max(delay, 60));
  }
});

function stepSimulation() {
  if (simIndex >= simTicks.length) {
    clearInterval(simTimer);
    simTimer = null;
    document.getElementById("simulateBtn").disabled = false;
    setMessage("Simulation complete.");
    return;
  }

  const currentId = simTicks[simIndex];   // who's running THIS second (or null = idle)
  drawGanttBox(currentId);
  updateLiveTable(simIndex + 1, currentId);   // "+1" because we've now completed second `simIndex`
  simIndex++;
}

// Adds one box to the Gantt chart for the second that just ran.
function drawGanttBox(id) {
  const chart = document.getElementById("ganttChart");
  const div = document.createElement("div");
  if (id === null) {
    div.className = "gantt-block idle";
    div.textContent = "";
  } else {
    const knownIds = [...new Set(simTicks.filter(x => x !== null))];
    div.className = "gantt-block";
    div.style.background = colors[knownIds.indexOf(id) % colors.length];
    div.textContent = id;
  }
  chart.appendChild(div);
  chart.scrollLeft = chart.scrollWidth;   // auto-scroll to keep the latest box visible
}

// Recomputes every process's live status/percent/remaining/waiting as of
// `secondsElapsed` seconds into the simulation, and redraws the table + stats.
function updateLiveTable(secondsElapsed, cpuId) {
  const body = document.getElementById("liveTableBody");
  body.innerHTML = "";

  let totalWaiting = 0, totalTurnaround = 0, completedCount = 0;

  simProcesses.forEach(p => {
    // how many of the ticks so far belonged to this process
    const runSoFar = simTicks.slice(0, secondsElapsed).filter(x => x === p.id).length;
    let status, remaining, completionPct, waiting, turnaround;

    if (secondsElapsed <= p.arrival && runSoFar === 0) {
      status = "Not Arrived"; remaining = p.burst; completionPct = 0; waiting = 0; turnaround = 0;
    } else if (runSoFar >= p.burst) {
      // finished — use the EXACT final numbers the algorithm computed,
      // so they stop changing once the process is done
      status = "Completed"; remaining = 0; completionPct = 100;
      waiting = p.turnaround - p.burst; turnaround = p.turnaround;
      completedCount++;
    } else if (cpuId === p.id) {
      status = "Running"; remaining = p.burst - runSoFar;
      completionPct = Math.round((runSoFar / p.burst) * 100);
      waiting = (secondsElapsed - p.arrival) - runSoFar;
      turnaround = secondsElapsed - p.arrival;
    } else {
      status = "Waiting"; remaining = p.burst - runSoFar;
      completionPct = Math.round((runSoFar / p.burst) * 100);
      waiting = (secondsElapsed - p.arrival) - runSoFar;
      turnaround = secondsElapsed - p.arrival;
    }

    totalWaiting += waiting;
    totalTurnaround += turnaround;

    const statusClass = "status-" + status.replace(" ", "");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${p.id}</td>
      <td class="${statusClass}">${status}</td>
      <td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${completionPct}%;"></div>
        <div class="bar-label">${completionPct}%</div></div></td>
      <td>${remaining}</td>
      <td>${waiting}</td>
    `;
    body.appendChild(row);
  });

  document.getElementById("avgWaiting").textContent = (totalWaiting / simProcesses.length).toFixed(2);
  document.getElementById("avgTurnaround").textContent = (totalTurnaround / simProcesses.length).toFixed(2);
  document.getElementById("totalExec").textContent = secondsElapsed + " / " + simTicks.length;
  document.getElementById("cpuNow").textContent = cpuId === null ? "Idle" : cpuId;

  // peek ahead to find the next DIFFERENT process that will run
  let nextId = "--";
  for (let t = secondsElapsed; t < simTicks.length; t++) {
    if (simTicks[t] !== null && simTicks[t] !== cpuId) { nextId = simTicks[t]; break; }
  }
  document.getElementById("nextQueue").textContent = nextId;

  const pct = Math.round((secondsElapsed / simTicks.length) * 100);
  document.getElementById("progressBar").style.width = pct + "%";
  document.getElementById("progressPct").textContent = pct + "%";
}

// ---------- INITIAL SAMPLE DATA ----------
generateSample();
function generateSample() {
  queue = [
    { id: "P1", arrival: 0, burst: 5 },
    { id: "P2", arrival: 1, burst: 3 },
    { id: "P3", arrival: 2, burst: 8 }
  ];
  idCounter = 3;
  renderQueueTable();
}
onAlgoChange();
