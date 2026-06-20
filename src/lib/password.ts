// Shared password policy validator.
// Rule: ≥8 characters, at least one uppercase, one lowercase, and one special character.
export const PASSWORD_RULE_TEXT =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a special character.";

export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character.";
  return null;
}