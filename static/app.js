let tasks = [];
let taskStates = {};
let taskDataTable = null;
let logDataTable = null;

let pendingFetches = 0;

function showSpinner() {
    pendingFetches++;
    document.getElementById("spinner").style.display = "flex";
}

function hideSpinner() {
    pendingFetches = Math.max(0, pendingFetches - 1);
    if (pendingFetches === 0) {
        document.getElementById("spinner").style.display = "none";
    }
}

function showToast(message, isError = false) {
    const toastEl = document.getElementById("appToast");
    toastEl.classList.remove("text-bg-success", "text-bg-danger");
    toastEl.classList.add(isError ? "text-bg-danger" : "text-bg-success");
    toastEl.querySelector(".toast-body").textContent = message;
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// Build parameters for selected preset
function getPresetConfig() {
    const preset = document.getElementById("preset").value;
    switch (preset) {
        case "h265_720":
            return {
                codec: "libx265",
                crf: 30,
                extra_args: ["-vf", "scale=-2:720", "-preset", "slow"]
            };
        case "av1_720_extreme":
            return {
                codec: "libaom-av1",
                crf: 45,
                extra_args: ["-b:v", "0", "-cpu-used", "6", "-row-mt", "1", "-vf", "scale=-2:720"]
            };
        case "vp9_720_web":
            return {
                codec: "libvpx-vp9",
                crf: 38,
                extra_args: ["-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-vf", "scale=-2:720"]
            };
        case "std":
        default:
            return {
                codec: "libx264",
                crf: 23,
                extra_args: []
            };
    }
}

function applyPresetToUI() {
    const cfg = getPresetConfig();
    document.getElementById("codec").value = cfg.codec;
    document.getElementById("crf").value = cfg.crf;
}

async function fetchWithSpinner(url, options, opts = {}) {
    const { show = true, delay = 200 } = opts;
    if (!show) {
        return fetch(url, options);
    }
    let displayed = false;
    const timer = setTimeout(() => { showSpinner(); displayed = true; }, delay);
    try {
        return await fetch(url, options);
    } finally {
        clearTimeout(timer);
        if (displayed) hideSpinner();
    }
}

async function fetchMaxConcurrent() {
    const res = await fetchWithSpinner("/api/max_concurrent");
    const data = await res.json();
    document.getElementById("maxConcurrent").value = data.max_concurrent_tasks;
}

async function setMaxConcurrent() {
    const value = parseInt(document.getElementById("maxConcurrent").value);
    await fetchWithSpinner("/api/max_concurrent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_concurrent_tasks: value })
    });
}

async function fetchDirs() {
    try {
        const res = await fetchWithSpinner("/api/dirs");
        if (!res.ok) {
            // Fallback to project defaults when unauthorized or error
            document.getElementById("inputDir").value = "input_videos";
            document.getElementById("outputDir").value = "output_videos";
            showToast("目录获取失败，已使用默认目录", true);
            return;
        }
        const data = await res.json();
        const input = data && data.input_dir ? data.input_dir : "input_videos";
        const output = data && data.output_dir ? data.output_dir : "output_videos";
        document.getElementById("inputDir").value = input;
        document.getElementById("outputDir").value = output;
    } catch (e) {
        console.error("fetchDirs error", e);
        document.getElementById("inputDir").value = "input_videos";
        document.getElementById("outputDir").value = "output_videos";
        showToast("目录获取异常，已使用默认目录", true);
    }
}

async function setDirs() {
    const inputDir = document.getElementById("inputDir").value;
    const outputDir = document.getElementById("outputDir").value;
    await fetchWithSpinner("/api/dirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_dir: inputDir, output_dir: outputDir })
    });
    refreshVideos();
}

async function refreshVideos() {
    const res = await fetchWithSpinner("/api/input_videos");
    const files = await res.json();
    const ul = document.getElementById("videoList");
    ul.innerHTML = "";
    files.forEach(f => {
        const li = document.createElement("li");
        li.className = "list-group-item";
        li.innerHTML = `<input class="form-check-input me-1" type="checkbox" value="${f}"> ${f}`;
        ul.appendChild(li);
    });
}

async function compressSelected() {
    const btn = document.getElementById("compressBtn");
    const btnSpinner = document.getElementById("compressBtnSpinner");
    // show small spinner on the button but keep page interactive
    btn.disabled = true;
    btnSpinner.classList.remove("d-none");
    const manualCodec = document.getElementById("codec").value;
    const manualCrf = parseInt(document.getElementById("crf").value);
    const presetCfg = getPresetConfig();
    const checkboxes = document.querySelectorAll("#videoList input[type=checkbox]:checked");
    if (checkboxes.length === 0) {
        showToast("请先选择至少一个视频", true);
        btn.disabled = false;
        btnSpinner.classList.add("d-none");
        return;
    }
    showToast("任务提交中，请勿重复点击");
    for (const cb of checkboxes) {
        // 先在前端添加占位任务, 以便任务列表立即显示
        tasks.push({ filename: cb.value, state: "PENDING", progress: 0 });
        renderTasks();
        try {
            // Submit without global overlay; rely on button spinner
            const res = await fetchWithSpinner("/api/compress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: cb.value,
                    // Use preset config primarily; fall back to manual if user changed later
                    codec: presetCfg.codec || manualCodec,
                    crf: (presetCfg.crf != null ? presetCfg.crf : manualCrf),
                    extra_args: presetCfg.extra_args || []
                })
            }, { show: false });
            if (!res.ok) {
                const text = await res.text();
                showToast(`任务提交失败: ${res.status} ${text}`, true);
                continue;
            }
            const data = await res.json();
            // 将新任务立即加入本地任务列表，避免等待下一次轮询
            tasks.push({
                task_id: data.task_id,
                filename: cb.value,
                state: "PENDING",
                progress: 0,
                speed: null
            });
            renderTasks();
            showToast(`任务已提交: ${data.task_id}`);
            taskStates[data.task_id] = "PENDING";
            // 更新任务状态, 确保新任务立即可见
            fetchTasks();
        } catch (err) {
            console.error(err);
            showToast("提交任务出错", true);
        }
    }
    fetchTasks();
    loadLogs();
    // restore button state
    btn.disabled = false;
    btnSpinner.classList.add("d-none");
}

async function loadLogs() {
    // Background poll: do not show global spinner
    const res = await fetch("/api/logs");
    const logs = await res.json();
    const tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = "";
    logs.reverse().forEach(log => {
        const tr = document.createElement("tr");
        const ratio = log.compression_ratio != null ? (log.compression_ratio * 100).toFixed(2) + "%" : "";
        const time = log.elapsed != null ? log.elapsed.toFixed(2) : "";
        tr.innerHTML = `
            <td>${log.timestamp || ""}</td>
            <td>${log.filename || (log.input_path ? log.input_path.split("/").pop() : "")}</td>
            <td>${log.codec || ""}</td>
            <td>${log.crf || ""}</td>
            <td>${ratio}</td>
            <td>${time}</td>
            <td>${log.returncode === 0 ? "成功" : "失败"}</td>
        `;
        tbody.appendChild(tr);
    });
    if (logDataTable) {
        logDataTable.destroy();
    }
    logDataTable = $('#logTable').DataTable();
}

function renderTasks() {
    const tbody = document.querySelector("#taskTable tbody");
    tbody.innerHTML = "";
    tasks.forEach(t => {
        const tr = document.createElement("tr");
        const progress = t.progress || 0;
        const speed = t.speed ? t.speed.toFixed(2) : "";
        tr.innerHTML = `
            <td>${t.filename}</td>
            <td>${t.state}</td>
            <td>
                <div class="progress">
                    <div class="progress-bar" role="progressbar" style="width: ${progress}%" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress.toFixed(0)}%</div>
                </div>
            </td>
            <td>${speed}</td>
        `;
        tbody.appendChild(tr);
    });
    if (taskDataTable) {
        taskDataTable.destroy();
    }
    taskDataTable = $('#taskTable').DataTable({
        paging: false,
        searching: false,
        info: false
    });
}

async function fetchTasks() {
    // Background poll: do not show global spinner
    const res = await fetch("/api/tasks");
    const newTasks = await res.json();
    if (Array.isArray(newTasks) && newTasks.length > 0) {
        newTasks.forEach(t => {
            const prev = taskStates[t.task_id];
            if (prev && prev !== "SUCCESS" && t.state === "SUCCESS") {
                showToast(`任务完成: ${t.filename}`);
            }
            taskStates[t.task_id] = t.state;
        });
        tasks = newTasks;
    }
    // 如果后端暂时返回空列表（同步执行中），保持现有占位任务不被清空
    renderTasks();
}

window.onload = function() {
    fetchDirs();
    refreshVideos();
    loadLogs();
    fetchTasks();
    fetchMaxConcurrent();
    applyPresetToUI();
    const presetEl = document.getElementById("preset");
    if (presetEl) {
        presetEl.addEventListener("change", applyPresetToUI);
    }
    setInterval(() => {
        fetchTasks();
        loadLogs();
    }, 5000);
};
