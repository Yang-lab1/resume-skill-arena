import { readFileSync } from "node:fs";

import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";

const schemaUrl = new URL("../../schemas/change-set.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaUrl, "utf8")) as object;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true
});
(formatsPlugin as unknown as (instance: Ajv2020) => Ajv2020)(ajv);

export const changeSetSchemaValidator = ajv.compile(schema);
