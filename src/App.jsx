import { useState, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Octokit } from "octokit";

const MODES = {
  LEETCODE: "LeetCode-Daily",
  CODEFORCE: "CodeForce-Daily",
  RANDOM: "Random Generation",
  CUSTOM: "Custom Build"
};

const LANGUAGES = {
  PYTHON: "python",
  CPP: "cpp",
  JAVA: "java",
  JAVASCRIPT: "javascript",
  GO: "go",
  RUST: "rust"
};

const LANGUAGE_EXTENSIONS = {
  python: ".py",
  cpp: ".cpp",
  java: ".java",
  javascript: ".js",
  go: ".go",
  rust: ".rs"
};

// API utility functions
async function fetchLeetCodeDaily() {
  const query = `
    query questionOfToday {
      activeDailyCodingChallengeQuestion {
        date
        link
        question {
          questionId
          questionFrontendId
          title
          titleSlug
          difficulty
          content
          topicTags {
            name
          }
          codeSnippets {
            lang
            code
          }
          exampleTestcases
          hints
        }
      }
    }
  `;

  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0"
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();
  return data.data.activeDailyCodingChallengeQuestion;
}

async function fetchCodeforcesDaily() {
  const response = await fetch("https://codeforces.com/api/problemset.problems");
  const data = await response.json();
  
  if (data.status !== "OK") {
    throw new Error("Codeforces API error");
  }

  const problems = data.result.problems;
  const today = new Date().toISOString().slice(0, 10);
  const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  const daily = problems[seed % problems.length];

  return {
    contestId: daily.contestId,
    index: daily.index,
    title: daily.name,
    difficulty: daily.rating || "Unrated",
    tags: daily.tags,
    url: `https://codeforces.com/problemset/problem/${daily.contestId}/${daily.index}`
  };
}

function cleanHtmlContent(html) {
  if (!html) return "";
  return html
    .replace(/<pre>/g, "\n```\n")
    .replace(/<\/pre>/g, "\n```\n")
    .replace(/<code>/g, "`")
    .replace(/<\/code>/g, "`")
    .replace(/<strong>/g, "**")
    .replace(/<\/strong>/g, "**")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSystemPrompt(mode, language, problemData = null) {
  const langMap = {
    python: "Python",
    cpp: "C++",
    java: "Java",
    javascript: "JavaScript",
    go: "Go",
    rust: "Rust"
  };

  if (mode === MODES.CUSTOM) {
    return `You are a senior software engineer.

For Custom Build requests, you MUST respond in this EXACT format:

REPO_NAME: <kebab-case-repository-name>
---CODE_START---
<actual source code here>
---CODE_END---

Rules:
1. REPO_NAME must be kebab-case (e.g., react-weather-app, todo-list-api)
2. Generate professional ${langMap[language]} code
3. Include comprehensive comments and docstrings
4. Follow best practices and style guides
5. Make code production-ready
6. NO markdown formatting, NO explanations outside the format above`;
  }

  if (mode === MODES.LEETCODE) {
    return `You are a competitive programming expert solving LeetCode problems.

Problem: ${problemData.title}
Difficulty: ${problemData.difficulty}
Topics: ${problemData.tags}

Problem Description:
${problemData.description}

${problemData.testCases ? `Test Cases:\n${problemData.testCases}` : ""}

${problemData.hints && problemData.hints.length > 0 ? `Hints:\n${problemData.hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : ""}

Generate a complete, optimal ${langMap[language]} solution with:
1. Detailed comments explaining the approach
2. Time and space complexity analysis
3. Clean, readable code following best practices
4. Handle all edge cases

Output ONLY the code solution, NO markdown, NO explanations.`;
  }

  if (mode === MODES.CODEFORCE) {
    return `You are a competitive programming expert solving Codeforces problems.

Problem: ${problemData.title}
Contest ID: ${problemData.contestId}${problemData.index}
Difficulty: ${problemData.difficulty}
Tags: ${problemData.tags.join(", ")}
URL: ${problemData.url}

Note: Visit the URL above for full problem statement, constraints, and examples.

Generate a complete ${langMap[language]} solution with:
1. Fast I/O handling (if applicable)
2. Optimal algorithm implementation
3. Comments explaining the approach
4. Time and space complexity analysis
5. Handle all edge cases

Output ONLY the code solution, NO markdown, NO explanations.`;
  }

  // RANDOM mode
  return `You are a senior software engineer.
Generate ONLY professional-quality ${langMap[language]} code.
- Include comprehensive comments and docstrings
- Use type hints/annotations where applicable
- Follow language-specific best practices and style guides
- Make code production-ready
- NO explanations
- NO markdown
- NO conversational text`;
}

export default function App() {
  const [mode, setMode] = useState(MODES.RANDOM);
  const [language, setLanguage] = useState(LANGUAGES.PYTHON);
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState([]);
  const [geminiKey, setGeminiKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [repoOverride, setRepoOverride] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const savedGemini = localStorage.getItem("GEMINI_API_KEY") || "";
    const savedGithub = localStorage.getItem("GITHUB_PAT") || "";
    setGeminiKey(savedGemini);
    setGithubToken(savedGithub);
  }, []);

  const log = (msg) => {
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const saveSettings = () => {
    localStorage.setItem("GEMINI_API_KEY", geminiKey);
    localStorage.setItem("GITHUB_PAT", githubToken);
    log("🔐 Credentials saved locally.");
  };

  const validGitHubPAT = /^gh[pousr]_[A-Za-z0-9_]{36,}$/.test(githubToken);

  const determineRepository = (mode, customRepoName = null) => {
    if (repoOverride) return repoOverride;
    
    switch (mode) {
      case MODES.LEETCODE:
      case MODES.CODEFORCE:
        return "DSA";
      case MODES.CUSTOM:
        return customRepoName || "GitExpress-Archived";
      case MODES.RANDOM:
      default:
        return "GitExpress-Archived";
    }
  };

  const parseCustomBuildResponse = (response) => {
    const repoMatch = response.match(/REPO_NAME:\s*([a-z0-9-]+)/i);
    const codeMatch = response.match(/---CODE_START---\s*([\s\S]*?)\s*---CODE_END---/);

    if (codeMatch) {
      return {
        repoName: repoMatch ? repoMatch[1].trim() : null,
        code: codeMatch[1].trim()
      };
    }

    // Fallback if format not followed
    return {
      repoName: null,
      code: response.trim()
    };
  };

  const start = async () => {
    if (!validGitHubPAT) {
      log("❌ Invalid GitHub PAT format.");
      return;
    }

    if (!geminiKey) {
      log("❌ Gemini API Key is required.");
      return;
    }

    if (mode === MODES.CUSTOM && !prompt.trim()) {
      log("❌ Prompt is required for Custom Build mode.");
      return;
    }

    setIsLoading(true);
    setLogs([]);

    try {
      let problemData = null;
      let userPrompt = prompt;

      // Fetch problem data based on mode
      if (mode === MODES.LEETCODE) {
        log("📥 Fetching today's LeetCode problem...");
        const leetcodeData = await fetchLeetCodeDaily();
        problemData = {
          title: leetcodeData.question.title,
          difficulty: leetcodeData.question.difficulty,
          description: cleanHtmlContent(leetcodeData.question.content),
          tags: leetcodeData.question.topicTags.map(t => t.name).join(", "),
          testCases: leetcodeData.question.exampleTestcases,
          hints: leetcodeData.question.hints || []
        };
        log(`✅ Loaded: ${problemData.title} (${problemData.difficulty})`);
      } else if (mode === MODES.CODEFORCE) {
        log("📥 Fetching today's Codeforces problem...");
        problemData = await fetchCodeforcesDaily();
        log(`✅ Loaded: ${problemData.title} (${problemData.difficulty})`);
      }

      // Generate code with Gemini
      log("🤖 Generating code solution...");
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(mode, language, problemData)
      });

      const result = await model.generateContent(
        mode === MODES.CUSTOM ? userPrompt : "Generate the solution"
      );
      const response = result.response.text();

      let code = response;
      let customRepoName = null;

      if (mode === MODES.CUSTOM) {
        const parsed = parseCustomBuildResponse(response);
        code = parsed.code;
        customRepoName = parsed.repoName;
        if (customRepoName) {
          log(`📦 Suggested repository: ${customRepoName}`);
        }
      }

      log(`✅ Code generated (${code.split("\n").length} lines)`);

      // Determine target repository
      const targetRepo = determineRepository(mode, customRepoName);
      log(`🎯 Target repository: ${targetRepo}`);

      // GitHub operations
      log("🔗 Connecting to GitHub...");
      const octokit = new Octokit({ auth: githubToken });
      const { data: user } = await octokit.rest.users.getAuthenticated();
      const owner = user.login;

      // Check/create repository
      try {
        await octokit.rest.repos.get({ owner, repo: targetRepo });
        log(`📁 Repository '${targetRepo}' found`);
      } catch {
        await octokit.rest.repos.createForAuthenticatedUser({
          name: targetRepo,
          private: true,
          description: `Auto-generated via GitExpress - Mode: ${mode}`
        });
        log(`📁 Repository '${targetRepo}' created`);
      }

      // Create filename
      const extension = LANGUAGE_EXTENSIONS[language];
      let filename;
      
      if (mode === MODES.LEETCODE && problemData) {
        filename = `leetcode_${problemData.title.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}${extension}`;
      } else if (mode === MODES.CODEFORCE && problemData) {
        filename = `cf_${problemData.contestId}${problemData.index}_${Date.now()}${extension}`;
      } else {
        filename = `script_${Date.now()}${extension}`;
      }

      // Commit to GitHub
      const contentBase64 = btoa(unescape(encodeURIComponent(code)));
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo: targetRepo,
        path: filename,
        message: `Add ${filename} - ${mode}`,
        content: contentBase64
      });

      log(`🎉 Successfully committed: ${filename}`);
      log(`🔗 View at: https://github.com/${owner}/${targetRepo}`);

    } catch (error) {
      log(`❌ Error: ${error.message}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <style>{`
        .app {
          background: #0d1117;
          color: #c9d1d9;
          min-height: 100vh;
          padding: 2rem;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
        }
        
        h1 {
          color: #58a6ff;
          margin-bottom: 0.5rem;
        }
        
        .subtitle {
          color: #8b949e;
          margin-bottom: 2rem;
          font-size: 0.9rem;
        }
        
        .panel {
          background: #161b22;
          padding: 1.5rem;
          margin-bottom: 1rem;
          border-radius: 8px;
          border: 1px solid #30363d;
        }
        
        h2 {
          color: #f0f6fc;
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.2rem;
        }
        
        label {
          display: block;
          color: #8b949e;
          margin-bottom: 0.3rem;
          font-size: 0.9rem;
        }
        
        input, select, textarea {
          width: 100%;
          margin-bottom: 1rem;
          background: #0d1117;
          color: #c9d1d9;
          border: 1px solid #30363d;
          padding: 0.6rem;
          border-radius: 6px;
          font-family: inherit;
          font-size: 0.95rem;
          transition: border-color 0.2s;
        }
        
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #58a6ff;
        }
        
        textarea {
          min-height: 100px;
          resize: vertical;
        }
        
        button {
          background: #238636;
          color: white;
          border: none;
          padding: 0.7rem 1.5rem;
          cursor: pointer;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.95rem;
          transition: background 0.2s;
        }
        
        button:hover:not(:disabled) {
          background: #2ea043;
        }
        
        button:disabled {
          background: #21262d;
          color: #484f58;
          cursor: not-allowed;
        }
        
        .warning {
          background: #1c2128;
          border-left: 3px solid #f85149;
          padding: 0.8rem;
          margin-top: 1rem;
          border-radius: 4px;
          font-size: 0.85rem;
          line-height: 1.5;
        }
        
        .warning a {
          color: #58a6ff;
          text-decoration: none;
        }
        
        .warning a:hover {
          text-decoration: underline;
        }
        
        .terminal {
          background: #010409;
          padding: 1rem;
          height: 300px;
          overflow-y: auto;
          border-radius: 6px;
          border: 1px solid #30363d;
        }
        
        .terminal pre {
          margin: 0;
          padding: 0.2rem 0;
          color: #7ee787;
          font-size: 0.85rem;
          font-family: inherit;
        }
        
        .terminal::-webkit-scrollbar {
          width: 8px;
        }
        
        .terminal::-webkit-scrollbar-track {
          background: #0d1117;
        }
        
        .terminal::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 4px;
        }
        
        .mode-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .mode-card {
          background: #0d1117;
          border: 2px solid #30363d;
          padding: 1rem;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .mode-card:hover {
          border-color: #58a6ff;
        }
        
        .mode-card.selected {
          border-color: #238636;
          background: #0d1b1f;
        }
        
        .mode-card h3 {
          margin: 0 0 0.5rem 0;
          color: #f0f6fc;
          font-size: 1rem;
        }
        
        .mode-card p {
          margin: 0;
          color: #8b949e;
          font-size: 0.85rem;
        }
        
        .row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .row > div {
          flex: 1;
        }
      `}</style>

      <h1>⚡ GitExpress</h1>
      <div className="subtitle">Multi-Mode AI Code Generator with GitHub Integration</div>

      <section className="panel">
        <h2>🔐 Settings</h2>
        <label>Gemini API Key</label>
        <input
          type="password"
          placeholder="Enter your Gemini API key"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
        />
        
        <label>GitHub Personal Access Token</label>
        <input
          type="password"
          placeholder="Enter your GitHub PAT"
          value={githubToken}
          onChange={(e) => setGithubToken(e.target.value)}
        />
        
        <button onClick={saveSettings}>💾 Save Settings</button>

        <div className="warning">
          ⚠️ Use a <b>Fine-Grained Token</b> with <b>Contents: Read & Write</b> permission only.
          <br />
          <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer">
            Create token →
          </a>
        </div>
      </section>

      <section className="panel">
        <h2>🎯 Mode Selection</h2>
        <div className="mode-grid">
          <div 
            className={`mode-card ${mode === MODES.LEETCODE ? 'selected' : ''}`}
            onClick={() => setMode(MODES.LEETCODE)}
          >
            <h3>📊 LeetCode Daily</h3>
            <p>Solve today's LeetCode challenge</p>
          </div>
          
          <div 
            className={`mode-card ${mode === MODES.CODEFORCE ? 'selected' : ''}`}
            onClick={() => setMode(MODES.CODEFORCE)}
          >
            <h3>🏆 Codeforces Daily</h3>
            <p>Solve today's Codeforces problem</p>
          </div>
          
          <div 
            className={`mode-card ${mode === MODES.RANDOM ? 'selected' : ''}`}
            onClick={() => setMode(MODES.RANDOM)}
          >
            <h3>🎲 Random Generation</h3>
            <p>Generate code from prompt</p>
          </div>
          
          <div 
            className={`mode-card ${mode === MODES.CUSTOM ? 'selected' : ''}`}
            onClick={() => setMode(MODES.CUSTOM)}
          >
            <h3>🔧 Custom Build</h3>
            <p>Build complete projects</p>
          </div>
        </div>

        <div className="row">
          <div>
            <label>Programming Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value={LANGUAGES.PYTHON}>Python</option>
              <option value={LANGUAGES.CPP}>C++</option>
              <option value={LANGUAGES.JAVA}>Java</option>
              <option value={LANGUAGES.JAVASCRIPT}>JavaScript</option>
              <option value={LANGUAGES.GO}>Go</option>
              <option value={LANGUAGES.RUST}>Rust</option>
            </select>
          </div>
          
          <div>
            <label>Repository Override (Optional)</label>
            <input
              type="text"
              placeholder="Leave empty for auto-selection"
              value={repoOverride}
              onChange={(e) => setRepoOverride(e.target.value)}
            />
          </div>
        </div>

        {(mode === MODES.CUSTOM || mode === MODES.RANDOM) && (
          <>
            <label>Prompt {mode === MODES.CUSTOM && <span style={{color: '#f85149'}}>*</span>}</label>
            <textarea
              placeholder={
                mode === MODES.CUSTOM 
                  ? "Describe the project you want to build (e.g., 'Create a React weather app with OpenWeather API')"
                  : "Describe the code you want to generate..."
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </>
        )}

        <button onClick={start} disabled={isLoading}>
          {isLoading ? "⏳ Processing..." : "🚀 Generate & Commit"}
        </button>
      </section>

      <section className="panel">
        <h2>📟 Terminal Output</h2>
        <div className="terminal">
          {logs.length === 0 && (
            <pre style={{color: '#8b949e'}}>Waiting for operation...</pre>
          )}
          {logs.map((l, i) => (
            <pre key={i}>{l}</pre>
          ))}
        </div>
      </section>
    </div>
  );
}
