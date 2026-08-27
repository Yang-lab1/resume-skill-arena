import { readFileSync } from "node:fs";

import { Ajv2020 } from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";

const schema = JSON.parse(
  readFileSync(
    new URL("../../schemas/frozen-baseline.schema.json", import.meta.url),
    "utf8"
  )
) as object;

const ajv = new Ajv2020({ allErrors: true, strict: true });
(formatsPlugin as unknown as (instance: Ajv2020) => Ajv2020)(ajv);

export const frozenBaselineSchemaValidator = ajv.compile(schema);
