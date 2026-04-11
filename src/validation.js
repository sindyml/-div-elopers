export function isValidPassword(password) {
  if (!password) return false;
  if (typeof password !== "string") return false;

  const trimmed = password.trim();
  return trimmed.length >= 6;
}