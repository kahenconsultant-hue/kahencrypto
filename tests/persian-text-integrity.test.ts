import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPersianTextIntegrity, validatePersianTextIntegrity } from "../src/lib/report/persianTextIntegrity";

test("corrupted Persian text fails public export validation", () => {
  const corrupted = "ب � ا ز ا ر ا م ر و ز ن ا پ ا ی د ا ر ا س ت";
  const result = validatePersianTextIntegrity(corrupted);
  assert.equal(result.valid, false);
  assert.throws(() => assertPersianTextIntegrity(corrupted), /Public export blocked/);
});

test("normal Persian report text passes RTL integrity validation", () => {
  const clean = "بازار کریپتو فعلاً جهت قطعی ندارد. نقدینگی تحت فشار است و داده‌ها باید در بروزرسانی بعدی دوباره بررسی شوند.";
  assert.equal(validatePersianTextIntegrity(clean).valid, true);
  assert.doesNotThrow(() => assertPersianTextIntegrity(clean));
});

