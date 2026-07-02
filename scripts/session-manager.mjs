import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const agentsDir = path.join(projectRoot, ".agents");

// Ensure .agents directory exists
if (!fs.existsSync(agentsDir)) {
  fs.mkdirSync(agentsDir, { recursive: true });
}

const checkpointPath = path.join(agentsDir, "session-checkpoint.md");
const patchPath = path.join(agentsDir, "session-diff.patch");

// Helper to run commands safely
function runCmd(cmd) {
  try {
    return execSync(cmd, { cwd: projectRoot, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(3);
  const params = {
    goal: "",
    evidence: "",
    blocker: "None",
    next: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--goal=")) params.goal = arg.substring(7);
    else if (arg === "--goal" || arg === "-g") params.goal = args[++i] || "";
    else if (arg.startsWith("--evidence=")) params.evidence = arg.substring(11);
    else if (arg === "--evidence" || arg === "-e") params.evidence = args[++i] || "";
    else if (arg.startsWith("--blocker=")) params.blocker = arg.substring(10);
    else if (arg === "--blocker" || arg === "-b") params.blocker = args[++i] || "None";
    else if (arg.startsWith("--next=")) params.next = arg.substring(7);
    else if (arg === "--next" || arg === "-n") params.next = args[++i] || "";
  }
  return params;
}

// Parse existing checkpoint to preserve values
function parseExistingCheckpoint() {
  const existing = { goal: "", evidence: "", blocker: "None", next: "", tasks: "" };
  if (!fs.existsSync(checkpointPath)) return existing;

  try {
    const content = fs.readFileSync(checkpointPath, "utf8");

    const goalMatch = content.match(/-\s+\*\*Goal\*\*:\s*(.*)/i);
    const blockerMatch = content.match(/-\s+\*\*Current Blocker\*\*:\s*(.*)/i);
    const nextMatch = content.match(/-\s+\*\*Next Command\/Steps\*\*:\s*(.*)/i);

    if (goalMatch) existing.goal = goalMatch[1].trim();
    if (blockerMatch) existing.blocker = blockerMatch[1].trim();
    if (nextMatch) existing.next = nextMatch[1].trim();

    // Extract Evidence / Findings section
    const evidenceSection = content.match(/## Evidence \/ Findings([\s\S]*?)(##|$)/i);
    if (evidenceSection) {
      existing.evidence = evidenceSection[1].trim();
    }

    // Extract Active Task List section
    const tasksSection = content.match(/## Active Task List([\s\S]*?)(##|$)/i);
    if (tasksSection) {
      existing.tasks = tasksSection[1].trim();
    }
  } catch {
    // Ignore reading errors, proceed with empty/defaults
  }
  return existing;
}

// Check if task.md exists in current workspace
function getWorkspaceTasks() {
  // Check typical places for task list
  const possiblePaths = [path.join(projectRoot, "task.md"), path.join(projectRoot, ".agents", "task.md")];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, "utf8").trim();
      } catch {
        // Ignore error
      }
    }
  }
  return "";
}

function checkpoint() {
  const params = parseArgs();
  const existing = parseExistingCheckpoint();

  // CLI params take precedence over existing checkpoint values
  const goal = params.goal || existing.goal || "Not specified (use --goal to set)";
  const evidence = params.evidence || existing.evidence || "None logged yet.";
  const blocker = params.blocker !== "None" ? params.blocker : existing.blocker || "None";
  const next = params.next || existing.next || "Not specified (use --next to set)";

  // Gather workspace state
  const timestamp = new Date().toISOString();
  const gitStatus = runCmd("git status --short") || "Clean workspace";
  const branchName = runCmd("git branch --show-current") || "unknown";

  // Write git diff to patch file
  const gitDiff = runCmd("git diff HEAD");
  if (gitDiff) {
    fs.writeFileSync(patchPath, gitDiff, "utf8");
  } else {
    if (fs.existsSync(patchPath)) {
      try {
        fs.unlinkSync(patchPath);
      } catch {
        // Ignore error
      }
    }
  }

  // Determine tasks
  const workspaceTasks = getWorkspaceTasks();
  const tasksContent = workspaceTasks || existing.tasks || "- [ ] (No active task checklist found)";

  const markdownContent = `# Session Checkpoint

* **Timestamp**: ${timestamp}
* **Branch**: \`${branchName}\`
* **Cwd**: \`${projectRoot}\`
* **Goal**: ${goal}
* **Current Blocker**: ${blocker}
* **Next Command/Steps**: ${next}

## Touched Files
\`\`\`text
${gitStatus}
\`\`\`

## Evidence / Findings
${evidence}

## Active Task List
${tasksContent}

## Git Diff Patch
${gitDiff ? `The session diff is stored in [session-diff.patch](file:///${patchPath.replace(/\\/g, "/")}).` : "No uncommitted changes in git."}
`;

  fs.writeFileSync(checkpointPath, markdownContent, "utf8");

  console.log("\x1b[32m%s\x1b[0m", "=========================================");
  console.log("\x1b[32m%s\x1b[0m", " SESSION CHECKPOINT CREATED SUCCESSFULLY!");
  console.log("\x1b[32m%s\x1b[0m", "=========================================");
  console.log(`\nCheckpoint saved to: .agents/session-checkpoint.md`);
  if (gitDiff) {
    console.log(`Diff patch saved to:  .agents/session-diff.patch`);
  }
  console.log("\n\x1b[36m%s\x1b[0m", "-----------------------------------------------------------------");
  console.log("Copy and paste the text below into your next AI agent session:");
  console.log("\x1b[36m%s\x1b[0m", "-----------------------------------------------------------------");
  console.log(
    `I am continuing a coding session. Please read the session checkpoint file at [session-checkpoint.md](file:///${checkpointPath.replace(/\\/g, "/")}) to get the context on the goal, touched files, diff, and next steps.`,
  );
  console.log("\x1b[36m%s\x1b[0m", "-----------------------------------------------------------------\n");
}

function resume() {
  if (!fs.existsSync(checkpointPath)) {
    console.log("\x1b[31m%s\x1b[0m", "No session checkpoint found at .agents/session-checkpoint.md");
    console.log('Run "npm run session:checkpoint" to create one first.');
    return;
  }

  const content = fs.readFileSync(checkpointPath, "utf8");
  console.log("\x1b[32m%s\x1b[0m", "=========================================");
  console.log("\x1b[32m%s\x1b[0m", "     RESUMING ACTIVE AGENT SESSION       ");
  console.log("\x1b[32m%s\x1b[0m", "=========================================");
  console.log("\n" + content);

  // Workspace sanity checks
  console.log("\x1b[35m%s\x1b[0m", "Workspace Check:");
  const gitStatus = runCmd("git status --short");
  if (gitStatus) {
    console.log("Uncommitted files found in workspace:\n" + gitStatus);
  } else {
    console.log("Workspace is clean.");
  }
}

const command = process.argv[2];
if (command === "checkpoint") {
  checkpoint();
} else if (command === "resume") {
  resume();
} else {
  console.log("Usage: node session-manager.mjs [checkpoint|resume] [options]");
  console.log("Options for checkpoint:");
  console.log('  --goal="Objective of session"');
  console.log('  --evidence="Findings so far"');
  console.log('  --blocker="Current blockers (default: None)"');
  console.log('  --next="Next steps or command to execute"');
}
