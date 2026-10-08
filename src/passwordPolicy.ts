export type PasswordStrength = 'Weak' | 'Fair' | 'Strong';

export type PasswordAssessment = {
  strength: PasswordStrength;
  valid: boolean;
  feedback: string;
};

const commonPasswords = new Set([
  'password123!',
  'password1234!',
  'p@ssword123!',
  'p@ssw0rd123!',
  'qwerty123!',
  'qwertyuiop123!',
  'welcome123!',
  'admin123456!',
  'letmein123!',
  'changeme123!',
]);

export function assessPassword(password: string): PasswordAssessment {
  const checks = [
    password.length >= 12,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const common = commonPasswords.has(password.toLowerCase());
  const valid = checks.every(Boolean) && !common;

  if (!password || !valid) {
    const missing = [
      checks[0] ? '' : 'at least 12 characters',
      checks[1] ? '' : 'a lowercase letter',
      checks[2] ? '' : 'an uppercase letter',
      checks[3] ? '' : 'a number',
      checks[4] ? '' : 'a special character',
      common ? 'a less common password' : '',
    ].filter(Boolean);
    return {
      strength: 'Weak',
      valid: false,
      feedback: common ? 'This password is too common.' : missing.length ? `Add ${missing.join(', ')}.` : 'Enter a stronger password.',
    };
  }

  return {
    strength: password.length >= 16 ? 'Strong' : 'Fair',
    valid: true,
    feedback: password.length >= 16
      ? 'Strong password.'
      : 'Good password. Use 16 or more characters for strong protection.',
  };
}

export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  const assessment = assessPassword(password);
  return assessment.valid
    ? null
    : `Password must be at least 12 characters and include uppercase and lowercase letters, a number, and a special character. ${assessment.feedback}`;
}
