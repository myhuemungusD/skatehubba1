/**
 * Commitlint Configuration
 * 
 * Enforces conventional commit format:
 * type(scope): subject
 * 
 * Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert
 * 
 * Examples:
 *   feat(socket): add real-time battle events
 *   fix(auth): resolve token refresh issue
 *   docs: update API documentation
 *   chore(deps): bump drizzle-orm to 0.44.2
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type must be one of these
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only
        'style',    // Code style (formatting, semicolons, etc)
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'test',     // Adding or updating tests
        'chore',    // Maintenance tasks
        'perf',     // Performance improvement
        'ci',       // CI/CD changes
        'build',    // Build system changes
        'revert',   // Revert a previous commit
      ],
    ],
    // Subject (description) rules
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 72],
    
    // Type rules
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    
    // Scope is optional but if provided, must be lowercase
    'scope-case': [2, 'always', 'lower-case'],
    
    // Header (full first line) max length
    'header-max-length': [2, 'always', 100],
    
    // Body rules
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],
    
    // Footer rules
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],
  },
};
