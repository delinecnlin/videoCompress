let tasks = [];
let taskStates = {};

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-bg-${type} border-0`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>`;
    container.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

async function fetchMaxConcurrent() {
    const res = await fetch("/api/max_concurrent");
    const data = await res.json();
    document.getElementById("maxConcurrent").value = data.max_concurrent_tasks;
}

async function setMaxConcurrent() {
    const value = parseInt(document.getElementById("maxConcurrent").value);
    await fetch("/api/max_concurrent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_concurrent_tasks: value })
    });
}

async function fetchDirs() {
    const res = await fetch("/api/dirs");
    const data = await res.json();
    document.getElementById("inputDir").value = data.input_dir;
    document.getElementById("outputDir").value = data.output_dir;
}

async function setDirs() {
    const inputDir = document.getElementById("inputDir").value;
    const outputDir = document.getElementById("outputDir").value;
    await fetch("/api/dirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_dir: inputDir, output_dir: outputDir })
    });
    refreshVideos();
}

async function refreshVideos() {
    const res = await fetch("/api/input_videos");
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
    const codec = document.getElementById("codec").value;
    const crf = parseInt(document.getElementById("crf").value);
    const checkboxes = document.querySelectorAll("#videoList input[type=checkbox]:checked");
    if (checkboxes.length === 0) {
        showToast("请先选择至少一个视频", "danger");
        return;
    }
    showToast("任务提交中，请勿重复点击", "info");
    for (const cb of checkboxes) {
        // 先在前端添加占位任务, 以便任务列表立即显示
        tasks.push({ filename: cb.value, state: "PENDING", progress: 0 });
        renderTasks();
        try {
            const res = await fetch("/api/compress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: cb.value,
                    codec: codec,
                    crf: crf
                })
            });
            if (!res.ok) {
                const text = await res.text();
                showToast(`任务提交失败: ${res.status} ${text}`, "danger");
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
            showToast(`任务已提交: ${data.task_id}`, "success");
            taskStates[data.task_id] = "PENDING";
            // 更新任务状态, 确保新任务立即可见
            fetchTasks();
        } catch (err) {
            console.error(err);
            showToast("提交任务出错", "danger");
        }
    }
    fetchTasks();
    loadLogs();
}

async function loadLogs() {
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
}

async function fetchTasks() {
    const res = await fetch("/api/tasks");
    const newTasks = await res.json();
    newTasks.forEach(t => {
        const prev = taskStates[t.task_id];
        if (prev && prev !== "SUCCESS" && t.state === "SUCCESS") {
            showToast(`任务完成: ${t.filename}`, "success");
        }
        taskStates[t.task_id] = t.state;
    });
    tasks = newTasks;
    renderTasks();
}

window.onload = function() {
    fetchDirs();
    refreshVideos();
    loadLogs();
    fetchTasks();
    fetchMaxConcurrent();
    setInterval(() => {
        fetchTasks();
        loadLogs();
    }, 5000);
};
