import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  GithubLogo,
  Check,
  CheckCircle,
  ClipboardText,
  FileDoc,
  FileImage,
  FolderOpen,
  LockKey,
  Plus,
  ShieldCheck,
  Sparkle,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { clipboardImageFiles } from "./clipboard-utils.js";
import { extractResumeText, resumeExtension } from "./input-extractors.js";
import { findOcrLine, tesseractLines } from "./ocr-utils.js";
import { findPdfTargetBox } from "./pdf-line-utils.js";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import { createWorker } from "tesseract.js";
import JSZip from "jszip";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const SKILLS = [
  { id: "career-ops", name: "career-ops", maker: "LOCAL / INSTALLED · ★ 66.1k", accent: "black", note: "求职流程、岗位适配与简历生成" },
  { id: "interview-coach", name: "interview-coach", maker: "LOCAL / INSTALLED · ★ 2.0k", accent: "red", note: "从简历证据到面试表达与追问" },
  { id: "asu", name: "asu", maker: "LOCAL / INSTALLED · ★ 144", accent: "yellow", note: "真实经历定位、改写与证据审计" },
  { id: "resume", name: "resume", maker: "LOCAL / INSTALLED · ★ 144", accent: "blue", note: "把真实经历整理成可编辑简历" },
  { id: "asu-resume", name: "asu-resume", maker: "LOCAL / INSTALLED · ★ 144", accent: "blue", note: "经历酥化与可编辑简历复刻" },
];

function Cover({ onEnter }) {
  return (
    <main className="cover-screen">
      <img className="cover-art" src="/assets/resume-studio-cover-clean.png" alt="简历改一改，面试自然来" />
      <button className="cover-enter" onClick={onEnter} aria-label="进入简历工作台">
        <span className="sr-only">进入简历工作台</span>
      </button>
      <div className="cover-guide" aria-hidden="true">
        <strong>进入工作台 <ArrowRight size={22} weight="bold" /></strong>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">RS</span>
      <span><strong>简历工作室</strong><small>RESUME SKILL ARENA</small></span>
    </div>
  );
}

function Progress({ screen }) {
  const current = screen === "setup" ? 0 : screen === "analysis" ? 1 : screen === "compare" ? 2 : 3;
  return (
    <ol className="progress-strip" aria-label="任务进度">
      {["导入材料", "选择 Skill", "横向对比", "选择结果"].map((label, index) => (
        <li key={label} className={index <= current ? "active" : ""}>
          <span>0{index + 1}</span><b>{label}</b>
        </li>
      ))}
    </ol>
  );
}

function FileDrop({ kind, file, onChange, title, detail, accept }) {
  const ref = useRef(null);
  return (
    <button type="button" className={`file-drop ${file ? "filled" : ""}`} onClick={() => ref.current?.click()}>
      <input ref={ref} className="sr-only" type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] || null)} />
      <span className="file-icon">{kind === "resume" ? <FileDoc size={27} weight="duotone" /> : <FileImage size={27} weight="duotone" />}</span>
      <span className="file-copy"><strong>{file?.name || title}</strong><small>{detail}</small></span>
      <span>{file ? <Check size={18} weight="bold" /> : <UploadSimple size={20} />}</span>
    </button>
  );
}

function JobInput({ text, onTextChange }) {
  const fileRef = useRef(null);
  const [fileNames, setFileNames] = useState([]);
  const [fileStatus, setFileStatus] = useState("");
  const [dragging, setDragging] = useState(false);

  const readJobFile = async (file) => {
    const extension = resumeExtension(file.name);
    if (![".txt", ".md", ".markdown", ".pdf", ".png", ".jpg", ".jpeg"].includes(extension)) {
      setFileStatus("仅支持 TXT、Markdown、PDF、PNG、JPG");
      return "";
    }
    setFileStatus(`正在读取 ${file.name}…`);
    const content = [".pdf", ".png", ".jpg", ".jpeg"].includes(extension)
      ? await extractResumeText(file, (progress) => {
        if (progress.stage === "pdf") setFileStatus(`正在提取 ${file.name} · 第 ${progress.current} / ${progress.total} 页…`);
        if (progress.stage === "ocr" && typeof progress.progress === "number") setFileStatus(`正在 OCR ${file.name}${progress.attempt > 1 ? " · 重试" : ""} · ${Math.round(progress.progress * 100)}%`);
      })
      : await file.text();
    setFileNames((items) => [...items, file.name]);
    return `===== ${file.name} =====\n${content.trim()}`;
  };

  const readJobFiles = async (files) => {
    const contents = [];
    for (const file of files) {
      try {
        const content = await readJobFile(file);
        if (content) contents.push(content);
      } catch (reason) {
        setFileStatus(reason instanceof Error ? reason.message : String(reason));
      }
    }
    if (contents.length) {
      onTextChange([text.trim(), ...contents].filter(Boolean).join("\n\n"));
      setFileStatus(`已读取 ${contents.length} 个岗位文件`);
    }
  };

  return (
    <section className={`job-input ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={async (event) => { event.preventDefault(); setDragging(false); await readJobFiles(Array.from(event.dataTransfer.files || [])); }}>
      <header>
        <span className="job-icon"><ClipboardText size={27} weight="duotone" /></span>
        <span><strong>岗位描述</strong><small>粘贴文字，或导入多份本地文件</small></span>
        <b translate="no">岗位</b>
      </header>
      <textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onPaste={async (event) => {
          const images = clipboardImageFiles(event.clipboardData);
          if (!images.length) return;
          event.preventDefault();
          await readJobFiles(images);
        }}
        placeholder="粘贴完整岗位描述…\n岗位职责、任职要求、加分项都可以直接放进来。"
        aria-label="岗位描述文字"
      />
      <div className="job-input-actions">
        <button type="button" onClick={() => fileRef.current?.click()}><FileDoc size={15} /> 导入文件</button>
        <input ref={fileRef} className="sr-only" type="file" multiple accept=".txt,.md,.markdown,.pdf,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg" onChange={async (event) => { await readJobFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
        <span>{fileStatus || (dragging ? "松开以导入本地文件" : "支持 TXT、Markdown、PDF、PNG、JPG，可多选")}</span>
      </div>
      {fileNames.length > 0 && <div className="job-files">{fileNames.map((fileName, index) => <span key={`${fileName}-${index}`}><FileDoc size={13} /><b>{fileName}</b></span>)}</div>}
      <p><ShieldCheck size={16} weight="duotone" /> 岗位文字会与简历使用同一个冻结基线，交给所选 Skill 独立处理。</p>
    </section>
  );
}

function SkillCard({ skill, selected, disabled, onToggle }) {
  return (
    <button className={`skill-card accent-${skill.accent} ${selected ? "selected" : ""}`} disabled={disabled && !selected} onClick={() => onToggle(skill.id)} aria-pressed={selected}>
      <span className="skill-check">{selected && <Check size={13} weight="bold" />}</span>
      <span><small>{skill.maker}</small><strong>{skill.name}</strong><em>{skill.note}</em></span>
    </button>
  );
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function SkillImportCard({ onClick, count }) {
  return (
    <button className="import-skill" type="button" onClick={onClick}>
      <span className="import-skill-icon"><Plus size={22} weight="bold" /></span>
      <span><strong>{count ? `自定义 Skill · ${count}` : "添加 Skill"}</strong><small>本地文件夹 / ZIP，或 GitHub 仓库</small></span>
    </button>
  );
}

function SkillImportModal({ onClose, onImported }) {
  const [mode, setMode] = useState("local");
  const [files, setFiles] = useState([]);
  const [github, setGithub] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const importLocal = async () => {
    if (!files.length) { setError("先选择 Skill 文件夹或 ZIP 文件。"); return; }
    setBusy(true); setError("");
    try {
      const payload = await Promise.all(files.map(async (file) => ({ path: file.webkitRelativePath || file.name, base64: await fileToBase64(file) })));
      const response = await fetch("http://127.0.0.1:4317/api/skills/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "local", files: payload }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message || "本地 Skill 导入失败。");
      onImported(result.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const importGithub = async () => {
    if (!github.trim()) { setError("请输入 GitHub 仓库地址或 owner/repo。"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("http://127.0.0.1:4317/api/skills/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "github", github: github.trim() }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message || "GitHub Skill 导入失败。");
      onImported(result.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop">
      <section className="skill-import-modal" role="dialog" aria-modal="true" aria-labelledby="skill-import-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        <span className="eyebrow">ADD SKILL / 本地安装</span>
        <h2 id="skill-import-title">把新的 Skill 带进来。</h2>
        <p>导入后只保存到本机运行目录；只有你点击“从 GitHub 导入”时才会联网。安装完成后仍需你手动勾选，才会参与本次运行。</p>
        <div className="import-tabs" role="tablist" aria-label="Skill 来源">
          <button className={mode === "local" ? "active" : ""} onClick={() => { setMode("local"); setError(""); }} role="tab" aria-selected={mode === "local"}><UploadSimple size={16} /> 本地文件</button>
          <button className={mode === "github" ? "active" : ""} onClick={() => { setMode("github"); setError(""); }} role="tab" aria-selected={mode === "github"}><GithubLogo size={16} /> GitHub</button>
        </div>
        {mode === "local" ? (
          <div className="import-panel">
            <div className="import-source-options">
              <label className="import-drop"><input aria-label="选择 Skill 文件夹" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} webkitdirectory="" directory="" /><FolderOpen size={26} weight="duotone" /><strong>选择文件夹</strong><small>包含原始 SKILL.md</small></label>
              <label className="import-drop"><input aria-label="选择 Skill ZIP 或 SKILL.md" type="file" accept=".zip,.md" onChange={(event) => setFiles(Array.from(event.target.files || []))} /><FileDoc size={26} weight="duotone" /><strong>选择 ZIP / SKILL.md</strong><small>单个压缩包或清单</small></label>
            </div>
            {files.length > 0 && <p className="import-selection">已选 {files.length} 个文件</p>}
            <button className="primary" disabled={busy || !files.length} onClick={importLocal}>{busy ? "正在导入…" : "导入到本机"} <ArrowRight size={18} weight="bold" /></button>
          </div>
        ) : (
          <div className="import-panel">
            <label className="import-field"><span>GitHub 仓库</span><input value={github} onChange={(event) => setGithub(event.target.value)} placeholder="https://github.com/owner/repo 或 owner/repo" /></label>
            <button className="primary" disabled={busy || !github.trim()} onClick={importGithub}>{busy ? "正在下载…" : "从 GitHub 导入"} <GithubLogo size={18} /></button>
          </div>
        )}
        {error && <p className="notice" role="alert">{error}</p>}
      </section>
    </div>
  );
}

function Setup({ onRun }) {
  const [resume, setResume] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeStatus, setResumeStatus] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [jobText, setJobText] = useState("");
  const [customSkills, setCustomSkills] = useState([]);
  const [selected, setSelected] = useState(["career-ops", "interview-coach", "asu-resume"]);
  const [missingSkills, setMissingSkills] = useState([]);
  const [checkingSkills, setCheckingSkills] = useState(false);
  const [skillAvailability, setSkillAvailability] = useState(null);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);

  const toggle = (id) => {
    setNotice("");
    setSelected((items) => {
      if (items.includes(id)) return items.filter((item) => item !== id);
      if (items.length >= 3) { setNotice("一次只能比较 3 个 Skill；先取消一个再添加。"); return items; }
      return [...items, id];
    });
  };

  const jobReady = jobText.trim().length > 0;
  const resumeReady = Boolean(resume && (resumeExtension(resume.name) === ".docx" || resumeText.trim()) && !resumeError);

  useEffect(() => {
    let active = true;
    const ids = [...SKILLS, ...customSkills].map((skill) => skill.id);
    fetch(`http://127.0.0.1:4317/api/skills/check?${ids.map((id) => `id=${encodeURIComponent(id)}`).join("&")}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!active || !payload.ok) return;
        const installed = new Set(payload.data?.installed?.map((skill) => skill.id) || []);
        const availability = Object.fromEntries(ids.map((id) => [id, installed.has(id)]));
        setSkillAvailability(availability);
        setSelected((items) => items.filter((id) => availability[id] !== false));
      })
      .catch(() => { if (active) setSkillAvailability(null); });
    return () => { active = false; };
  }, [customSkills]);

  useEffect(() => {
    let active = true;
    if (!selected.length) { setMissingSkills([]); return () => { active = false; }; }
    setCheckingSkills(true);
    fetch(`http://127.0.0.1:4317/api/skills/check?${selected.map((id) => `id=${encodeURIComponent(id)}`).join("&")}`)
      .then((response) => response.json())
      .then((payload) => { if (active) setMissingSkills(payload.ok ? (payload.data?.missing || []) : selected); })
      .catch(() => { if (active) setMissingSkills(selected); })
      .finally(() => { if (active) setCheckingSkills(false); });
    return () => { active = false; };
  }, [selected]);

  const handleResumeChange = async (file) => {
    setResume(file);
    setResumeText("");
    setResumeError("");
    setResumeStatus("");
    if (!file) return;
    const extension = resumeExtension(file.name);
    if (![".docx", ".pdf", ".png", ".jpg", ".jpeg"].includes(extension)) {
      setResumeError("简历仅支持 DOCX、PDF、PNG、JPG。");
      return;
    }
    if (extension === ".docx") return;
    setResumeStatus(resumeExtension(file.name) === ".pdf" ? "正在提取 PDF 文字…" : "正在 OCR 图片文字…首次使用可能需要下载 OCR 语言包。");
    try {
      const text = await extractResumeText(file, (progress) => {
        if (progress.stage === "pdf") setResumeStatus(`正在提取第 ${progress.current} / ${progress.total} 页…`);
        if (progress.stage === "ocr" && typeof progress.progress === "number") setResumeStatus(`正在 OCR 图片${progress.attempt > 1 ? "（重试）" : ""}… ${Math.round(progress.progress * 100)}%`);
      });
      setResumeText(text);
      setResumeStatus(`已识别 ${text.length.toLocaleString()} 字，可开始运行`);
    } catch (reason) {
      setResumeError(reason instanceof Error ? reason.message : String(reason));
      setResumeStatus("识别失败");
    }
  };

  const handleImported = (data) => {
    const accent = ["blue", "red", "yellow", "black"][customSkills.length % 4];
    const imported = { id: data.id, name: data.name, maker: data.source === "github" ? "LOCAL / GITHUB" : "LOCAL / IMPORTED", accent, note: `已安装 · ${data.version}` };
    setCustomSkills((items) => items.some((item) => item.id === imported.id) ? items : [...items, imported]);
    setSelected((items) => items.includes(imported.id) || items.length >= 3 ? items : [...items, imported.id]);
    setNotice(`已添加 ${imported.name}。请确认它的原始 Skill 名称后再开始运行。`);
    setImporting(false);
  };

  return (
    <section className="setup-shell">
      <aside className="setup-poster">
        <span className="eyebrow">NEW RESUME RUN / 本地任务</span>
        <h1><span>先放材料，</span><span>再选改法。</span></h1>
        <p>上传简历，选 Skill，开始比较。</p>
        <span className="truth-label">只处理你的真实材料。</span>
      </aside>

      <div className="setup-content">
        <section className="paper-panel">
            <header className="panel-title">
            <span>01</span><div><h2>导入简历和岗位</h2><p>简历 DOCX / PDF / PNG / JPG；岗位支持文字与文件。</p></div><LockKey size={22} weight="duotone" />
          </header>
          <div className="material-layout">
            <div className="resume-input">
              <span className="input-label">个人简历 <b>1 份</b></span>
              <FileDrop kind="resume" file={resume} onChange={handleResumeChange} title="上传本地简历" detail={resumeStatus || (resume ? "原文件仅写入本地临时运行目录" : "支持 DOCX、PDF、PNG、JPG")} accept=".docx,.pdf,.png,.jpg,.jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/png,image/jpeg" />
              {resumeError && <p className="notice" role="alert">{resumeError}</p>}
            </div>
            <div className="job-input-column">
              <span className="input-label">岗位描述 <b>完整文字</b></span>
              <JobInput text={jobText} onTextChange={setJobText} />
            </div>
          </div>
        </section>

        <section className="paper-panel">
          <header className="panel-title">
            <span>02</span><div><h2>这次让哪些 Skill 来改</h2><p>固定选 3 个；每个 Skill 独立处理同一份基线。</p></div><strong className="counter">{selected.length} / 3</strong>
          </header>
          <div className="skill-grid">
            {SKILLS.map((skill) => <SkillCard key={skill.id} skill={{ ...skill, maker: skillAvailability?.[skill.id] === false ? "LOCAL / NOT INSTALLED" : skill.maker }} selected={selected.includes(skill.id)} disabled={skillAvailability?.[skill.id] === false || selected.length >= 3} onToggle={toggle} />)}
            <SkillImportCard count={customSkills.length} onClick={() => setImporting(true)} />
          </div>
          {customSkills.length > 0 && <div className="custom-skill-list">{customSkills.map((skill) => <SkillCard key={skill.id} skill={skill} selected={selected.includes(skill.id)} disabled={selected.length >= 3} onToggle={toggle} />)}</div>}
          {notice && <p className="notice" role="status">{notice}</p>}
          {missingSkills.length > 0 && <p className="notice" role="alert">所选 Skill 尚未安装：{missingSkills.join("、")}。请先导入对应 Skill，或取消选择。</p>}
        </section>

        <footer className="setup-footer">
          <div className="privacy"><ShieldCheck size={24} weight="duotone" /><span><strong>文件保存在本地运行目录</strong><small>改写由你当前登录的 Codex 宿主处理，开始前统一确认。</small></span></div>
          <button className="primary" disabled={!resumeReady || !jobReady || selected.length === 0 || checkingSkills || missingSkills.length > 0} onClick={() => setConfirming(true)}>开始真实运行 <ArrowRight size={20} weight="bold" /></button>
        </footer>
      </div>
      {confirming && <div className="modal-backdrop"><section className="permission-confirm" role="dialog" aria-modal="true" aria-labelledby="permission-title"><button className="modal-close" onClick={() => setConfirming(false)} aria-label="关闭"><X size={20} /></button><span className="eyebrow">REAL RUN / 统一确认</span><h2 id="permission-title">这次会真的运行。</h2><p>原文件保存在本机；PDF 与图片已先完成文字提取。解析后的简历文字和岗位文字会交给你当前登录的 Codex，由所选 Skill 生成结果。</p><div className="modal-checks"><span><Check size={16} weight="bold" /> 只读取你选择的简历文件</span><span><Check size={16} weight="bold" /> GitHub 与 OCR 按需联网</span><span><Check size={16} weight="bold" /> 失败时不生成替代结果</span></div><button className="primary" onClick={() => onRun({ resume, resumeText: resumeText || undefined, job: { text: jobText }, skills: [...SKILLS, ...customSkills].filter((skill) => selected.includes(skill.id)) })}>确认并开始真实运行 <ArrowRight size={18} weight="bold" /></button></section></div>}
      {importing && <SkillImportModal onClose={() => setImporting(false)} onImported={handleImported} />}
    </section>
  );
}

function Analysis({ run, onDone }) {
  const [status, setStatus] = useState("正在准备本地材料并冻结真实基线…");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ stage: "intake", completed: 0, total: run.skills.length + 3, message: "已接收材料，准备冻结基线。" });
  const [activeSkillId, setActiveSkillId] = useState("");
  useEffect(() => {
    let active = true;
    const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    async function execute() {
      try {
        const bytes = new Uint8Array(await run.resume.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        setStatus(`正在实际调用 ${run.skills.length} 个 Skill；通常需要 1–5 分钟…`);
        const response = await fetch("http://127.0.0.1:4317/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resume: { name: run.resume.name, mediaType: run.resume.type, base64: btoa(binary), ...(run.resumeText ? { extractedText: run.resumeText } : {}) }, jobText: run.job.text, skillIds: run.skills.map((skill) => skill.id) })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "真实运行失败。");
        if (!active) return;
        const jobId = payload.data?.jobId;
        if (!jobId) throw new Error("本地运行没有返回任务编号。");
        while (active) {
          const statusResponse = await fetch(`http://127.0.0.1:4317/api/runs/status/${encodeURIComponent(jobId)}`);
          const statusPayload = await statusResponse.json();
          if (!statusResponse.ok || !statusPayload.ok) throw new Error(statusPayload.error?.message || "无法读取真实运行进度。");
          const job = statusPayload.data;
          setProgress(job.progress);
          setActiveSkillId(job.progress.skillId || "");
          setStatus(job.progress.message);
          if (job.status === "FAILED") throw new Error(job.error || "真实运行失败。");
          if (job.status === "COMPLETED") {
            setStatus("真实结果已返回，正在装载比较工作台…");
            onDone(job.result);
            break;
          }
          await wait(900);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    }
    execute();
    return () => { active = false; };
  }, [onDone]);

  const progressRatio = Math.min(1, Math.max(0, progress.completed / Math.max(1, progress.total)));

  return (
    <section className="analysis-screen">
      {!error && <div className="analysis-global-progress" role="progressbar" aria-label="真实运行进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progressRatio * 100)}><span style={{ width: `${progressRatio * 100}%` }} /><i style={{ left: `${progressRatio * 100}%` }} /></div>}
      <div className="analysis-poster">
        <span>REAL PROVIDER RUN / 非演示</span>
        <h1>{error ? "运行失败，\n不会造结果。" : "真实 Skill，\n正在工作。"}</h1>
        {!error && <div className="real-run-pulse" />}
      </div>
      <div className="analysis-list">
        {error ? <div className="run-error"><X size={24} weight="bold" /><p><strong>没有生成候选结果</strong><small>{error}</small></p></div> : <>
          <p className="run-status">{status}</p>
          {run.skills.map((skill, index) => {
            const done = progress.completed > index + 1;
            const active = activeSkillId === skill.id;
            const state = done ? "已完成" : active ? (progress.status === "RUNNING" ? "执行中" : "处理中") : "等待中";
            return <div key={skill.id} className={done ? "done" : active ? "active" : ""}><span>0{index + 1}</span><p><strong>{skill.name}</strong><small>{done ? "已返回并通过门禁" : active ? "正在真实执行…" : "等待进入队列"}</small></p><span className={`analysis-state ${done ? "done" : active ? "active" : ""}`}>{state}<Sparkle size={20} weight="duotone" /></span></div>;
          })}
        </>}
      </div>
    </section>
  );
}

function OriginalResumePreview({ file, targetText, targetPath, activeSkillId }) {
  const docxRef = useRef(null);
  const [docxStatus, setDocxStatus] = useState("idle");
  const [detectedBox, setDetectedBox] = useState(undefined);
  const name = file?.name || "未命名简历";
  const isBlob = typeof Blob !== "undefined" && file instanceof Blob;
  const extension = resumeExtension(name);
  const [previewUrl, setPreviewUrl] = useState("");
  const [floatingImages, setFloatingImages] = useState([]);

  useEffect(() => {
    if (!isBlob || !name.toLowerCase().endsWith(".docx") || !docxRef.current) return undefined;
    let cancelled = false;
    setDocxStatus("loading");
    docxRef.current.innerHTML = "";
    import("docx-preview").then(({ renderAsync }) => renderAsync(file, docxRef.current, docxRef.current, {
      inWrapper: true,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      useBase64URL: true,
      experimental: true,
    })).then(() => { if (!cancelled) setDocxStatus("ready"); }).catch(() => { if (!cancelled) setDocxStatus("error"); });
    return () => { cancelled = true; };
  }, [file, isBlob, name]);

  useEffect(() => {
    if (!isBlob || extension !== ".docx") { setFloatingImages([]); return undefined; }
    let cancelled = false;
    const urls = [];
    (async () => {
      try {
        const zip = await JSZip.loadAsync(file);
        const documentXml = await zip.file("word/document.xml")?.async("text");
        const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("text");
        if (!documentXml || !relsXml) return;
        const documentDom = new DOMParser().parseFromString(documentXml, "application/xml");
        const relsDom = new DOMParser().parseFromString(relsXml, "application/xml");
        const relationships = new Map(Array.from(relsDom.getElementsByTagNameNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship")).map((node) => [node.getAttribute("Id"), node.getAttribute("Target")]));
        const pageSize = documentDom.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "pgSz")[0];
        const pageWidth = Number(pageSize?.getAttribute("w") || 11906) * 635;
        const pageHeight = Number(pageSize?.getAttribute("h") || 16838) * 635;
        const images = [];
        for (const anchor of Array.from(documentDom.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "anchor"))) {
          const blip = anchor.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip")[0];
          const relationship = relationships.get(blip?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed"));
          if (!relationship) continue;
          const mediaPath = `word/${relationship.replace(/^\/+/, "")}`;
          const media = zip.file(mediaPath);
          if (!media) continue;
          const blob = await media.async("blob");
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const extent = anchor.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "extent")[0];
          const horizontal = anchor.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "posOffset");
          images.push({
            url,
            left: `${(Number(horizontal[0]?.textContent || 0) / pageWidth) * 100}%`,
            top: `${(Number(horizontal[1]?.textContent || 0) / pageHeight) * 100}%`,
            width: `${(Number(extent?.getAttribute("cx") || 600000) / pageWidth) * 100}%`,
            height: `${(Number(extent?.getAttribute("cy") || 760000) / pageHeight) * 100}%`,
          });
        }
        if (!cancelled) setFloatingImages(images);
      } catch { if (!cancelled) setFloatingImages([]); }
    })();
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [file, isBlob, extension]);

  useEffect(() => {
    if (!isBlob || extension === ".docx") {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isBlob, extension]);

  useEffect(() => {
    setDetectedBox(undefined);
  }, [targetText, targetPath]);

  useEffect(() => {
    if (docxStatus !== "ready" || !docxRef.current || !targetText) { setDetectedBox(undefined); return undefined; }
    const frame = window.requestAnimationFrame(() => {
      const nodes = Array.from(docxRef.current.querySelectorAll("p,h1,h2,h3,h4,h5"));
      const normalizedTarget = targetText.replace(/[\u200b\ufeff]/g, "").replace(/[•·]/g, "").replace(/\s+/g, "");
      // The XML paragraph index is not guaranteed to match docx-preview's
      // rendered node list: empty paragraphs, page breaks and table wrappers
      // may be omitted or represented differently. Exact frozen text is the
      // only locator source; a duplicate or missing match is not guessed.
      const matches = nodes.filter((node) => node.textContent.replace(/[\u200b\ufeff]/g, "").replace(/[•·]/g, "").replace(/\s+/g, "") === normalizedTarget);
      const target = matches.length === 1 ? matches[0] : undefined;
      if (!target) { setDetectedBox(null); return; }
      const canvas = docxRef.current.closest(".document-canvas");
      const scroller = docxRef.current.closest(".resume-original");
      const targetRect = target.getBoundingClientRect();
      const top = targetRect.top - canvas.getBoundingClientRect().top;
      setDetectedBox({ top: Math.max(28, top - 3), height: Math.max(22, targetRect.height + 6) });
      if (scroller) scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 3), behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [docxStatus, targetText, targetPath]);

  const markerLabel = detectedBox === null ? "原稿未找到对应段落" : activeSkillId ? `正在对比 · ${activeSkillId}` : "正在对比真实原文";
  const markerStyle = detectedBox && typeof detectedBox === "object" ? { top: `${detectedBox.top}px`, height: `${detectedBox.height}px` } : undefined;

  if (isBlob && extension === ".pdf") return <PdfResumePreview file={file} targetText={targetText} activeSkillId={activeSkillId} />;
  if (isBlob && extension !== ".docx") return <ImageResumePreview file={file} targetText={targetText} activeSkillId={activeSkillId} previewUrl={previewUrl} />;

  return (
    <div className="document-canvas document-docx">
      <div ref={docxRef} className="docx-preview-body" aria-label={`${name} 原稿预览`} />
      {floatingImages.map((image, index) => <img key={`${image.url}-${index}`} className="docx-floating-image" src={image.url} alt="简历原稿图片" style={{ left: image.left, top: image.top, width: image.width, height: image.height }} />)}
      {docxStatus === "loading" && <div className="document-message">正在本地还原 DOCX 排版…</div>}
      {docxStatus === "error" && <div className="document-message error">这份 DOCX 无法在浏览器中还原。</div>}
      {!isBlob && <div className="document-message error"><FileDoc size={38} weight="duotone" /><strong>没有真实原稿文件</strong></div>}
      {isBlob && targetText && detectedBox !== undefined && <div className={`source-marker ${detectedBox === null ? "not-found" : "located"}`} style={markerStyle}><span>{markerLabel}</span></div>}
    </div>
  );
}

function normalizedSourceText(value) {
  return String(value || "").replace(/^【第\s*\d+\s*页】\s*/, "").replace(/\s+/g, "");
}

function PdfResumePreview({ file, targetText, activeSkillId }) {
  const scrollerRef = useRef(null);
  const pageRefs = useRef(new Map());
  const [pages, setPages] = useState([]);
  const [status, setStatus] = useState("loading");
  const target = normalizedSourceText(targetText);

  useEffect(() => {
    let cancelled = false;
    let loadingTask;
    setStatus("loading");
    setPages([]);
    (async () => {
      try {
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const pdf = await loadingTask.promise;
        const nextPages = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const content = await page.getTextContent();
          nextPages.push({ pageNumber, page, viewport, items: content.items });
        }
        if (!cancelled) { setPages(nextPages); setStatus("ready"); }
      } catch { if (!cancelled) setStatus("error"); }
    })();
    return () => { cancelled = true; loadingTask?.destroy?.(); };
  }, [file]);

  useEffect(() => {
    if (status !== "ready" || !target) return undefined;
    let cancelled = false;
    const frame = window.requestAnimationFrame(async () => {
      for (const pageData of pages) {
        const match = findPdfTargetBox(pageData.items, pageData.viewport, target);
        const pageNode = pageRefs.current.get(pageData.pageNumber);
        if (!pageNode) continue;
        const marker = pageNode.querySelector(".source-marker");
        if (match) {
          const displayScale = pageNode.clientWidth / pageData.viewport.width || 1;
          marker.style.left = `${match.left * displayScale}px`;
          marker.style.top = `${match.top * displayScale}px`;
          marker.style.width = `${match.width * displayScale}px`;
          marker.style.height = `${match.height * displayScale}px`;
          marker.dataset.state = "located";
          if (!cancelled) pageNode.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
        marker.dataset.state = "not-found";
      }
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [pages, status, target]);

  if (status === "loading") return <div className="document-canvas document-message">正在还原 PDF 原稿并建立定位索引…</div>;
  if (status === "error") return <div className="document-canvas document-message error">这份 PDF 无法在浏览器中还原。</div>;
  return <div ref={scrollerRef} className="document-canvas document-file pdf-pages">
    {pages.map(({ pageNumber, page, viewport }) => <PdfPage key={pageNumber} page={page} viewport={viewport} pageNumber={pageNumber} pageRefs={pageRefs} activeSkillId={activeSkillId} />)}
  </div>;
}

function PdfPage({ page, viewport, pageNumber, pageRefs, activeSkillId }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    page.render({ canvasContext: context, viewport }).promise.catch(() => {});
    return undefined;
  }, [page, viewport]);
  return <div className="pdf-page" ref={(node) => { if (node) pageRefs.current.set(pageNumber, node); else pageRefs.current.delete(pageNumber); }}>
    <canvas ref={canvasRef} aria-label={`第 ${pageNumber} 页原稿`} />
    <div className="source-marker not-found"><span>{activeSkillId ? `正在对比 · ${activeSkillId}` : "正在对比真实原文"}</span></div>
  </div>;
}

function ImageResumePreview({ file, targetText, activeSkillId, previewUrl }) {
  const imageRef = useRef(null);
  const scrollerRef = useRef(null);
  const [lines, setLines] = useState(undefined);
  const [box, setBox] = useState(undefined);
  const [imageReady, setImageReady] = useState(false);
  const target = normalizedSourceText(targetText);
  useEffect(() => {
    let cancelled = false;
    setLines(undefined);
    (async () => {
      try {
        const worker = await createWorker(["chi_sim", "eng"]);
        const result = await worker.recognize(file, {}, { text: true, blocks: true });
        await worker.terminate();
        if (cancelled) return;
        setLines(tesseractLines(result.data));
      } catch { if (!cancelled) setLines([]); }
    })();
    return () => { cancelled = true; };
  }, [file]);
  useEffect(() => {
    if (lines === undefined) { setBox(undefined); return; }
    setBox(findOcrLine(lines, target, normalizedSourceText)?.bbox || null);
  }, [lines, target]);
  useEffect(() => { if (box && scrollerRef.current) scrollerRef.current.scrollTo({ top: Math.max(0, box.y0 - 120), behavior: "smooth" }); }, [box]);
  const image = imageReady ? imageRef.current : null;
  const markerStyle = box && image ? { left: `${(box.x0 / image.naturalWidth) * 100}%`, top: `${(box.y0 / image.naturalHeight) * 100}%`, width: `${((box.x1 - box.x0) / image.naturalWidth) * 100}%`, height: `${((box.y1 - box.y0) / image.naturalHeight) * 100}%` } : undefined;
  return <div ref={scrollerRef} className="document-canvas document-file image-page">
    {previewUrl && <div className="image-wrap"><img ref={imageRef} onLoad={() => setImageReady(true)} className="document-file-image" src={previewUrl} alt="原稿预览" />{box !== undefined && <div className={`source-marker ${box ? "located" : "not-found"}`} style={markerStyle}><span>{box ? (activeSkillId ? `正在对比 · ${activeSkillId}` : "正在对比真实原文") : "原稿未找到对应文字"}</span></div>}</div>}
  </div>;
}

function Compare({ run, onBack }) {
  const allBlocks = run.execution.comparison.blocks;
  const changedBlocks = allBlocks.filter((block) => block.candidates.length > 0);
  const availableSkills = run.execution.skills?.length ? run.execution.skills : run.skills;
  const [sectionIndex, setSectionIndex] = useState(0);
  const [adopted, setAdopted] = useState({});
  const [drafts, setDrafts] = useState({});
  const [activeSkillId, setActiveSkillId] = useState(changedBlocks[0]?.candidates[0]?.skillId || "");
  const [editValue, setEditValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const section = changedBlocks[sectionIndex];
  const candidates = section?.candidates || [];
  const activeCandidate = candidates.find((candidate) => candidate.skillId === activeSkillId);
  const selectedId = section ? adopted[section.blockId] : undefined;
  const selectedDraft = section ? drafts[section.blockId] : undefined;
  const adoptedCount = Object.keys(adopted).length;
  const canFinish = changedBlocks.length > 0 && adoptedCount === changedBlocks.length;
  const finalBlocks = allBlocks.map((block) => {
    const selectedSkillId = adopted[block.blockId];
    const selectedCandidate = block.candidates.find((candidate) => candidate.skillId === selectedSkillId);
    return {
      ...block,
      selectedSkillId,
      selectedLabel: selectedSkillId === "baseline" ? "保留原文" : selectedSkillId || "未确认",
      selectedText: drafts[block.blockId] ?? block.originalText,
      selectedCandidate,
    };
  });
  const finalText = finalBlocks.reduce((text, block) => {
    if (!text || !block.selectedText || block.selectedText === block.originalText) return text;
    const occurrences = text.split(block.originalText).length - 1;
    return occurrences === 1 ? text.replace(block.originalText, block.selectedText) : text;
  }, run.resumeText || finalBlocks.map((block) => block.selectedText).join("\n\n"));
  const downloadFinalDraft = () => {
    const blob = new Blob([finalText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(run.resume?.name || "resume").replace(/\.[^.]+$/, "")}-final-draft.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const preferredSkillId = availableSkills.some((skill) => skill.id === activeSkillId)
      ? activeSkillId
      : availableSkills[0]?.id || candidates[0]?.skillId || "";
    if (preferredSkillId !== activeSkillId) setActiveSkillId(preferredSkillId);
    const nextCandidate = candidates.find((candidate) => candidate.skillId === preferredSkillId);
    setEditValue(nextCandidate?.proposedText || section?.originalText || "");
    setEditing(false);
  }, [sectionIndex, activeSkillId, run.execution.skills]);

  const choose = (candidate, value = candidate.proposedText) => {
    setAdopted((items) => ({ ...items, [section.blockId]: candidate.skillId }));
    setDrafts((items) => ({ ...items, [section.blockId]: value }));
    setFinalConfirmed(false);
    setEditing(false);
  };

  const keepOriginal = () => {
    setAdopted((items) => ({ ...items, [section.blockId]: "baseline" }));
    setDrafts((items) => ({ ...items, [section.blockId]: section.originalText }));
    setFinalConfirmed(false);
    setEditing(false);
  };

  if (!section) return <section className="empty-real-run"><button className="back" onClick={onBack}><ArrowLeft size={16} /> 返回材料</button><span className="eyebrow">NO VERIFIED CHANGESET</span><h1>没有通过门禁的真实改写。</h1><p>系统没有生成替代文案。请查看 Provider 运行状态后重试。</p><div className="provider-audit">{run.execution.providers.map((provider) => <div key={provider.providerId}><strong>{provider.providerId}</strong><span>{provider.status}</span><small>{provider.errorMessage || provider.issueCodes?.join("、") || provider.invocationId}</small></div>)}</div></section>;

  return (
    <section className="compare-shell">
      <aside className="section-rail">
        <button className="back" onClick={onBack}><ArrowLeft size={16} /> 返回材料</button><p>真实修改区块</p>
        {changedBlocks.map((item, index) => <button key={item.blockId} className={index === sectionIndex ? "active" : ""} onClick={() => { setSectionIndex(index); setActiveSkillId(item.candidates[0]?.skillId || ""); setEditing(false); }} title={item.originalText}><span>{String(index + 1).padStart(2, "0")}</span><b>区块 {index + 1}</b>{adopted[item.blockId] && <Check size={14} weight="bold" />}</button>)}
        <div className="fact-note"><ShieldCheck size={21} weight="duotone" /><strong>事实已锁定</strong><small>数字、公司、日期不会被 Skill 擅自改写。</small></div>
      </aside>

      <div className="comparison-stage">
        <header className="comparison-heading"><div><span className="eyebrow">SOURCE BLOCK {sectionIndex + 1} / {changedBlocks.length}</span><h1>比较真实原文</h1></div><strong>已通过门禁</strong></header>
        <div className="skill-tabs" role="tablist" aria-label="不同 Skill 的改写结果">
          {availableSkills.map((skill, index) => { const candidate = candidates.find((item) => item.skillId === skill.id); const accent = SKILLS.find((item) => item.id === skill.id)?.accent || "black"; return <button key={skill.id} role="tab" aria-selected={activeSkillId === skill.id} className={`accent-${accent} ${activeSkillId === skill.id ? "active" : ""} ${candidate ? "" : "unmodified"}`} onClick={() => { setActiveSkillId(skill.id); setEditing(false); }}><span>{String.fromCharCode(65 + index)}</span><b>{skill.id}</b>{candidate ? (selectedId === candidate.skillId && <CheckCircle size={16} weight="fill" />) : <small>未修改</small>}</button>; })}
        </div>
        {activeCandidate && <article className={`candidate-detail accent-${SKILLS.find((skill) => skill.id === activeCandidate.skillId)?.accent || "black"}`}>
          <header><span><small>CODEX HOST / {activeCandidate.invocationId}</small><strong>{activeCandidate.skillId}</strong></span>{selectedId === activeCandidate.skillId && <b><Check size={14} weight="bold" /> 已采用</b>}</header>
          {editing ? <textarea value={editValue} onChange={(event) => setEditValue(event.target.value)} autoFocus aria-label="修改这条建议" /> : <p>{selectedId === activeCandidate.skillId ? (selectedDraft ?? activeCandidate.proposedText) : activeCandidate.proposedText}</p>}
          <div className="reason"><strong>为什么这样改 · {activeCandidate.category}</strong><small>{activeCandidate.rationale}</small><em>风险：{activeCandidate.riskLevel} · 版本：{activeCandidate.skillVersion}</em></div>
          <div className="candidate-actions"><button className="primary" onClick={() => choose(activeCandidate, editing ? editValue : (selectedDraft ?? activeCandidate.proposedText))}>{selectedId === activeCandidate.skillId ? "更新已采用版本" : "采用这个版本"}</button><button onClick={() => { setEditValue(selectedDraft ?? activeCandidate.proposedText ?? ""); setEditing((value) => !value); }}>{editing ? "取消改写" : "自己改写"}</button><button onClick={keepOriginal}>保留原文</button></div>
        </article>}
        {!activeCandidate && activeSkillId && <article className="candidate-detail candidate-detail-empty">
          <header><span><small>CODEX HOST / NO CHANGE</small><strong>{activeSkillId}</strong></span><b>保留原文</b></header>
          <p>这个 Skill 没有对当前区块生成改写，原文保持不变。</p>
          <div className="candidate-actions"><button className="primary" onClick={keepOriginal}>保留原文</button></div>
        </article>}
        <nav className="pagination"><button disabled={sectionIndex === 0} onClick={() => setSectionIndex((i) => i - 1)}><ArrowLeft size={17} /> 上一段</button><span>{sectionIndex + 1} / {changedBlocks.length}</span><button disabled={sectionIndex === changedBlocks.length - 1} onClick={() => setSectionIndex((i) => i + 1)}>下一段 <ArrowRight size={17} /></button></nav>
      </div>

      <aside className="live-preview">
        <header><div><span className="live-dot" /><span><b>原始简历</b><small>{run.resume?.name || "未命名简历"}</small></span></div><strong>原稿哈希：{run.execution.resume.hash.slice(0, 8)}</strong></header>
        <div className="resume-original"><OriginalResumePreview file={run.resume} targetText={section.originalText} targetPath={section.structuralPath} activeSkillId={activeCandidate?.skillId} /></div>
        <footer><span><b>{adoptedCount}</b> / {changedBlocks.length} 个区块已确认</span><div className="preview-footer-actions"><button onClick={() => setAuditOpen(true)}>查看真实运行记录 <ArrowRight size={16} weight="bold" /></button><button className="finish-cta" disabled={!canFinish} onClick={() => { setFinalConfirmed(false); setFinalOpen(true); }} title={canFinish ? "查看已确认的最终定稿" : `还需确认 ${changedBlocks.length - adoptedCount} 个区块`}>查看最终定稿 <ArrowRight size={16} weight="bold" /></button></div></footer>
      </aside>

      {auditOpen && <div className="modal-backdrop"><section className="finish-modal" role="dialog" aria-modal="true" aria-labelledby="audit-title"><button className="modal-close" onClick={() => setAuditOpen(false)} aria-label="关闭"><X size={20} /></button><span>PROVIDER AUDIT / 真实记录</span><h2 id="audit-title">每一版，<br />都有来源。</h2><div className="provider-audit">{run.execution.providers.map((provider) => <div key={provider.providerId}><strong>{provider.providerId}</strong><span>{provider.status}</span><small>{provider.invocationId} · {provider.durationMs ?? 0} ms</small></div>)}</div><button className="primary" onClick={() => setAuditOpen(false)}>返回继续比较</button></section></div>}
      {finalOpen && <div className="modal-backdrop"><section className="finish-modal final-draft-modal" role="dialog" aria-modal="true" aria-labelledby="final-title"><button className="modal-close" onClick={() => setFinalOpen(false)} aria-label="关闭"><X size={20} /></button><span>FINAL DRAFT / 已确认版本</span><h2 id="final-title">你的最终定稿。</h2><p>先确认完整内容，确认无误后才会出现下载按钮。内容来自本次真实运行与逐段确认。</p><div className="final-draft-preview"><pre>{finalText}</pre></div><div className="final-draft-actions">{finalConfirmed ? <><button onClick={() => { setFinalConfirmed(false); setFinalOpen(false); }}>返回继续比较</button><button className="primary" onClick={downloadFinalDraft}>下载到本地 <ArrowDown size={16} weight="bold" /></button></> : <><button onClick={() => setFinalOpen(false)}>返回继续比较</button><button className="primary" onClick={() => setFinalConfirmed(true)}>确认内容无误</button></>}</div>{finalConfirmed && <small className="download-note">已确认。点击“下载到本地”后由浏览器保存到你的下载位置。</small>}</section></div>}
    </section>
  );
}

export function App() {
  const [screen, setScreen] = useState("cover");
  const [run, setRun] = useState(null);
  if (screen === "cover") return <Cover onEnter={() => setScreen("setup")} />;
  return <main className="app-shell"><header className="app-header"><Brand /><Progress screen={screen} /><div className="local-badge"><span /> 本地工作区 · Codex</div></header>{screen === "setup" && <Setup onRun={(details) => { setRun(details); setScreen("analysis"); }} />}{screen === "analysis" && run && <Analysis run={run} onDone={(execution) => { setRun((current) => ({ ...current, execution })); setScreen("compare"); }} />}{screen === "compare" && run?.execution && <Compare run={run} onBack={() => setScreen("setup")} />}</main>;
}
