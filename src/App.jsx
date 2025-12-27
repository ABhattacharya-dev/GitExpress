import { useState, useEffect } from "react";
import styles from "./App.module.css";
import { runGitExpress } from "./logic";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState([]);
  const [geminiKey, setGeminiKey] = useState("");
  const [githubToken, setGithubToken] = useState("");

  useEffect(() => {
    setGeminiKey(localStorage.getItem("GEMINI_API_KEY") || "");
    setGithubToken(localStorage.getItem("GITHUB_PAT") || "");
  }, []);

  const log = (msg) =>
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const saveSettings = () => {
    localStorage.setItem("GEMINI_API_KEY", geminiKey);
    localStorage.setItem("GITHUB_PAT", githubToken);
    log("🔐 Credentials saved locally.");
  };

  const validGitHubPAT = /^gh[pousr]_[A-Za-z0-9_]{36,}$/.test(githubToken);

  const start = async () => {
    if (!validGitHubPAT) {
      log("❌ Invalid GitHub PAT format.");
      return;
    }
    await runGitExpress({ prompt, geminiKey, githubToken, log });
  };

  return (
    <div className={styles.app}>
      <h1>⚡ GitExpress</h1>

      <section className={styles.panel}>
        <h2>Settings</h2>
        <input
          type="password"
          placeholder="Gemini API Key"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
        />
        <input
          type="password"
          placeholder="GitHub Fine-Grained PAT"
          value={githubToken}
          onChange={(e) => setGithubToken(e.target.value)}
        />
        <button onClick={saveSettings}>Save</button>

        <p className={styles.warning}>
          ⚠️ Use a <b>Fine-Grained Token</b> with <b>Contents: Read & Write</b> only.
          <br />
          <a
            href="https://github.com/settings/tokens?type=beta"
            target="_blank"
          >
            Create token →
          </a>
        </p>
      </section>

      <section className={styles.panel}>
        <h2>Prompt</h2>
        <textarea
          placeholder="Describe the Python code you want..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button onClick={start}>🚀 Start</button>
      </section>

      <section className={styles.terminal}>
        {logs.map((l, i) => (
          <pre key={i}>{l}</pre>
        ))}
      </section>
    </div>
  );
}
