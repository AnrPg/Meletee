// A small JSON-Schema checker (the subset our schemas use), JSON parsing with a little
// forgiveness, and the schemas of the structured AI jobs. Pure; unit-tested.

export function check(schema, v, path = '$', out = []) {
  if (!schema || out.length > 40) return out;
  const t = schema.type;
  const ok = !t || (t === 'array' ? Array.isArray(v)
    : t === 'object' ? v && typeof v === 'object' && !Array.isArray(v)
      : t === 'integer' ? Number.isInteger(v)
        : t === 'number' ? typeof v === 'number' && Number.isFinite(v)
          : typeof v === t);
  if (!ok) { out.push(`${path}: expected ${t}`); return out; }
  if (schema.enum && !schema.enum.includes(v)) out.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (t === 'string' && schema.minLength && v.trim().length < schema.minLength) out.push(`${path}: too short`);
  if (t === 'array') {
    if (schema.minItems && v.length < schema.minItems) out.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.maxItems && v.length > schema.maxItems) out.push(`${path}: at most ${schema.maxItems} items`);
    if (schema.items) v.forEach((x, i) => check(schema.items, x, `${path}[${i}]`, out));
  }
  if (t === 'object') {
    for (const r of schema.required || []) if (v[r] === undefined) out.push(`${path}.${r}: missing`);
    for (const [k, x] of Object.entries(v)) {
      if (schema.properties?.[k]) check(schema.properties[k], x, `${path}.${k}`, out);
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: unknown field`);
    }
  }
  return out;
}

const stripFence = (t) => String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

export function parseJSON(text) {
  const s = stripFence(text);
  try { return JSON.parse(s); } catch { /* try the outermost object */ }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new SyntaxError('not valid JSON');
}

// Parse + validate. Returns { data, errors }.
export function validate(text, schema, extra) {
  let data;
  try { data = parseJSON(text); } catch { return { data: null, errors: ['The answer was not valid JSON.'] }; }
  let errors = check(schema, data);
  if (!errors.length && extra) errors = extra(data) || [];
  return { data, errors };
}

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

// noema-lite's aiGrade format.
export const GRADE = obj({ score: { type: 'integer' }, verdict: str, covered: strs, missing: strs, mistakes: strs, feedback: str });
export const gradeCheck = (g) => (g.score < 0 || g.score > 100 ? ['$.score: must be 0-100'] : []);

export const QUESTIONS = obj({ questions: { type: 'array', items: obj({ q: str, a: str }) } });
export const questionsCheck = (d) => (d.questions.length ? [] : ['$.questions: needs at least 1 item']);

export const ERRORS = obj({
  summary: str,
  groups: { type: 'array', items: obj({ name: str, why: str, count: { type: 'integer' }, tip: str }) },
});
