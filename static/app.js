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
        li.innerHTML = `<input type="checkbox" value="${f}"> ${f}`;
        ul.appendChild(li);
    });
}

async function compressSelected() {
    const codec = document.getElementById("codec").value;
    const crf = parseInt(document.getElementById("crf").value);
    const checkboxes = document.querySelectorAll("#videoList input[type=checkbox]:checked");
    for (const cb of checkboxes) {
        await fetch("/api/compress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filename: cb.value,
                codec: codec,
                crf: crf
            })
        });
    }
    alert("压缩任务已提交");
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

window.onload = function() {
    fetchDirs();
    refreshVideos();
    loadLogs();
};
