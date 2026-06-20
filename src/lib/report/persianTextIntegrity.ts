export type PersianTextIntegrityResult = {
  valid: boolean;
  errors: string[];
  replacementCharacterCount: number;
  isolatedPresentationCharacterCount: number;
  singleLetterWordRatio: number;
};

const PERSIAN_LETTER = /[\u0600-\u06ff]/u;
const ARABIC_PRESENTATION_FORM = /[\ufb50-\ufdff\ufe70-\ufeff]/gu;

export function validatePersianTextIntegrity(text: string): PersianTextIntegrityResult {
  const errors: string[] = [];
  const replacementCharacterCount = (text.match(/�/g) ?? []).length;
  const isolatedPresentationCharacterCount = (text.match(ARABIC_PRESENTATION_FORM) ?? []).length;
  const words = text
    .replace(/[\p{P}\p{S}\p{N}]+/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length > 0 && PERSIAN_LETTER.test(word));
  const singleLetterWords = words.filter((word) => [...word].length === 1).length;
  const singleLetterWordRatio = words.length ? singleLetterWords / words.length : 0;

  if (replacementCharacterCount > 0) errors.push("replacement_characters_detected");
  if (isolatedPresentationCharacterCount > 0) errors.push("arabic_presentation_forms_detected");
  if (words.length >= 10 && singleLetterWordRatio > 0.3) errors.push("excessive_single_letter_fragments");

  return {
    valid: errors.length === 0,
    errors,
    replacementCharacterCount,
    isolatedPresentationCharacterCount,
    singleLetterWordRatio,
  };
}

export function assertPersianTextIntegrity(text: string) {
  const result = validatePersianTextIntegrity(text);
  if (!result.valid) {
    throw new Error(`Persian RTL validation failed. Public export blocked. ${result.errors.join(", ")}`);
  }
  return result;
}

