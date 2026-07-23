import { loginDefaults } from "../mockData.js";
import { todayLocalIso } from "../lib/datetime.js";

export const EMPTY_UPLOAD_FORM = {
  receiptDate: todayLocalIso(),
  schoolId: "",
  visaTypeCode: "",
};

export const emptyOrgForms = {
  school: { ...loginDefaults.school },
  agency: { ...loginDefaults.agency },
};

export const EMPTY_UPLOAD_FEEDBACK = {
  phase: "idle",
  fileName: "",
  message: "",
  batch: null,
};
