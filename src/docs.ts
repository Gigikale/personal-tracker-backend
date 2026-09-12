import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

export function loadOpenApiSpec(): object {
  const file = readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf8');
  return yaml.load(file) as object;
}
