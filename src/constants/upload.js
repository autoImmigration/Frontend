import { loginDefaults } from "../mockData.js";

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
