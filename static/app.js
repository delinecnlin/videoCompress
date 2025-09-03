let tasks = [];
let taskStates = {};
let taskDataTable;
let logDataTable;

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
        alert("请先选择至少一个视频");
        return;
    }
    alert("任务提交中，请勿重复点击");
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
                alert(`任务提交失败: ${res.status} ${text}`);
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
            alert(`任务已提交: ${data.task_id}`);
            taskStates[data.task_id] = "PENDING";
            // 更新任务状态, 确保新任务立即可见
            fetchTasks();
        } catch (err) {
            console.error(err);
            alert("提交任务出错");
        }
    }
    fetchTasks();
    loadLogs();
}

async function loadLogs() {
    const res = await fetch("/api/logs");
    const logs = await res.json();
    const rows = logs.reverse().map(log => {
        const ratio = log.compression_ratio != null ? (log.compression_ratio * 100).toFixed(2) + "%" : "";
        const time = log.elapsed != null ? log.elapsed.toFixed(2) : "";
        return [
            log.timestamp || "",
            log.filename || (log.input_path ? log.input_path.split("/").pop() : ""),
            log.codec || "",
            log.crf || "",
            ratio,
            time,
            log.returncode === 0 ? "成功" : "失败"
        ];
    });
    if (!logDataTable) {
        logDataTable = $('#logTable').DataTable({
            order: [],
            data: rows
        });
    } else {
        logDataTable.clear();
        logDataTable.rows.add(rows).draw();
    }
}

function renderTasks() {
    const rows = tasks.map(t => {
        const progress = t.progress || 0;
        const speed = t.speed ? t.speed.toFixed(2) : "";
        return [
            t.filename,
            t.state,
            `<div class="progress"><div class="progress-bar" role="progressbar" style="width: ${progress}%" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress.toFixed(0)}%</div></div>`,
            speed
        ];
    });
    if (!taskDataTable) {
        taskDataTable = $('#taskTable').DataTable({
            paging: false,
            searching: false,
            info: false,
            order: [],
            data: rows
        });
    } else {
        taskDataTable.clear();
        taskDataTable.rows.add(rows).draw();
    }
}

async function fetchTasks() {
    const res = await fetch("/api/tasks");
    const newTasks = await res.json();
    newTasks.forEach(t => {
        const prev = taskStates[t.task_id];
        if (prev && prev !== "SUCCESS" && t.state === "SUCCESS") {
            alert(`任务完成: ${t.filename}`);
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
