// Type augmentation for SST Resource bindings used by the OCR module.
// The SST platform generates the full declaration in `.sst/platform/config.d.ts`
// at deploy/dev time; this file extends it so TypeScript is satisfied in
// environments (e.g. CI unit tests) where the `.sst` directory is absent.
declare module 'sst' {
  interface Resource {
    BEDROCK_MODEL_ID: {
      value: string;
    };
  }
}
