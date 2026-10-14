/**
 * Local ESLint plugin for Email Hub workspace rules (T-015 / SD#12.1 / SD#14.5).
 */

/**
 * @param {string} filename
 * @returns {string | null}
 */
function featureFromPath(filename) {
  const normalized = filename.replace(/\\/g, "/")
  const match = normalized.match(/\/features\/([^/]+)\//)
  return match?.[1] ?? null
}

/**
 * @param {string} filename
 * @param {string} source
 * @returns {string | null}
 */
function resolveImportFeature(filename, source) {
  const normalizedFile = filename.replace(/\\/g, "/")

  if (source.startsWith("@/")) {
    const rest = source.slice(2)
    const match = rest.match(/^features\/([^/]+)/)
    return match?.[1] ?? null
  }

  if (source.includes("/features/") || source.startsWith("features/")) {
    const match = source.replace(/\\/g, "/").match(/(?:^|\/)features\/([^/]+)/)
    return match?.[1] ?? null
  }

  if (source.startsWith(".")) {
    const dir = normalizedFile.includes("/")
      ? normalizedFile.slice(0, normalizedFile.lastIndexOf("/"))
      : "."
    const parts = [...dir.split("/"), ...source.split("/")]
    const resolved = []
    for (const part of parts) {
      if (part === "." || part === "") continue
      if (part === "..") {
        resolved.pop()
        continue
      }
      resolved.push(part)
    }
    const joined = resolved.join("/")
    const match = joined.match(/(?:^|\/)features\/([^/]+)(?:\/|$)/)
    return match?.[1] ?? null
  }

  return null
}

/** @type {import("eslint").Rule.RuleModule} */
const noCrossFeatureImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow imports across features/* folders (SD#12.1). Shared code belongs in components/app or packages/shared.",
    },
    schema: [],
    messages: {
      crossFeature:
        'Do not import across features (from "{{from}}" into "{{to}}"). Move shared code to components/app or packages/shared.',
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename()
    const currentFeature = featureFromPath(filename)
    if (!currentFeature) {
      return {}
    }

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string") return
        const importedFeature = resolveImportFeature(
          filename,
          node.source.value
        )
        if (importedFeature && importedFeature !== currentFeature) {
          context.report({
            node: node.source,
            messageId: "crossFeature",
            data: { from: importedFeature, to: currentFeature },
          })
        }
      },
    }
  },
}

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "workspace", version: "0.0.0" },
  rules: {
    "no-cross-feature-imports": noCrossFeatureImports,
  },
}

export default plugin
