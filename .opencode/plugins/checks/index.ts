import { Plugin } from "@opencode/plugin"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

/*
 * Dev-only edit hook for Perfect IPTV.
 *
 * Runs a syntax check in the same turn as an edit so a broken file is reported
 * immediately. It intentionally never runs Playwright, a build, or a formatter.
 */
const run = promisify(execFile)

type TextPart = { type: "text"; text: string }

function parts(content: unknown): TextPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }]
  if (Array.isArray(content)) return content.filter(
    (part): part is TextPart => !!part && typeof part === "object" && (part as TextPart).type === "text",
  )
  return []
}

async function check(cwd: string, command: string, args: string[]): Promise<string | null> {
  try {
    await run(command, args, { cwd, timeout: 5000 })
    return null
  } catch (err) {
    const error = err as { stderr?: string; stdout?: string; message?: string }
    const text = String(error.stderr || error.stdout || error.message || err)
    return text.split("\n").slice(0, 40).join("\n")
  }
}

function withNote(result: unknown, note: string): unknown {
  if (!result || typeof result !== "object") return { content: [{ type: "text", text: note }] }
  const current = result as Record<string, unknown> & { content?: unknown }
  const content = parts(current.content)
  return { ...current, content: [...content, { type: "text", text: note }] }
}

export default Plugin.define({
  id: "perfect-iptv-checks",
  async setup(ctx) {
    await ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed") return
      if (!["edit", "write", "patch"].includes(event.tool)) return

      const input = event.input as { path?: string; filePath?: string }
      const file = input.path ?? input.filePath
      if (!file) return

      let failure: string | null = null
      if (file.endsWith(".js")) {
        failure = await check(ctx.location.directory, "node", ["--check", file])
      } else if (file.endsWith("config.xml")) {
        failure = await check(ctx.location.directory, "xmllint", ["--noout", file])
      }
      if (!failure) return

      event.result = withNote(
        event.result,
        `Static check failed for ${file}\n${failure}`,
      ) as typeof event.result
    })
  },
})
