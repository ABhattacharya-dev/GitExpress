import { GoogleGenerativeAI } from "@google/generative-ai";
import { Octokit } from "octokit";

const SYSTEM_PROMPT = `
You are a senior software engineer.
Generate ONLY professional-quality Python code.
- Include docstrings
- Use type hints
- Follow PEP8
- No explanations
- No markdown
- No conversational text
`;

export async function runGitExpress({
  prompt,
  geminiKey,
  githubToken,
  log,
}) {
  const genAI = new GoogleGenerativeAI(geminiKey);
  log("🤖 Generating professional Python script...");

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(prompt);
  const code = result.response.text();

  log(`✅ Code received (${code.split("\n").length} lines).`);

  const octokit = new Octokit({ auth: githubToken });
  log("🐙 Connecting to GitHub...");

  const { data: user } = await octokit.rest.users.getAuthenticated();
  const owner = user.login;
  const repo = "GitExpress-Archive";

  try {
    await octokit.rest.repos.get({ owner, repo });
    log("📁 Repository found.");
  } catch {
    await octokit.rest.repos.createForAuthenticatedUser({
      name: repo,
      private: true,
    });
    log("📁 Repository created.");
  }

  const filename = `script_${Date.now()}.py`;

  const contentBase64 = btoa(unescape(encodeURIComponent(code)));

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filename,
    message: `Add ${filename}`,
    content: contentBase64,
  });

  log(`🎉 Commit successful: '${filename}'`);
}
