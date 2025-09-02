let tasks = [];

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
    for (const cb of checkboxes) {
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
            alert(`任务已提交: ${data.task_id}`);
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
    const tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = "";
    logs.reverse().forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${log.timestamp || ""}</td>
            <td>${log.input_path ? log.input_path.split("/").pop() : ""}</td>
            <td>${log.output_path ? log.output_path.split("/").pop() : ""}</td>
            <td>${log.codec || ""}</td>
            <td>${log.crf || ""}</td>
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
    tasks = await res.json();
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
    }, 3000);
};
