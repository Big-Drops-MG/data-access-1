/**
 * Shared commitlint config.
 * Enforces: <type>(T-###): <summary>
 * Types and task-id scope match the project developer rules.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  parserPreset: {
    parserOpts: {
      headerPattern:
        /^(feat|fix|chore|docs|test|refactor|perf|ci|build)\((T-\d+)\):\s(.+)$/,
      headerCorrespondence: ["type", "scope", "subject"],
    },
  },
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "test",
        "refactor",
        "perf",
        "ci",
        "build",
      ],
    ],
    "type-empty": [2, "never"],
    "scope-empty": [2, "never"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never"],
    "subject-case": [0],
    "subject-max-length": [2, "always", 72],
    "header-max-length": [2, "always", 100],
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
  },
}
