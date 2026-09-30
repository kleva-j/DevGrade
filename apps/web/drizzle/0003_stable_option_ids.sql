-- Drizzle owns the transaction. Keep writers out between validation and conversion;
-- readers (including the Stage 1 compatibility release) can continue normally.
DO $migration$
DECLARE
  question record;
  option_value jsonb;
  option_kind text;
  option_text text;
  option_id numeric;
  option_ids numeric[];
  -- Match JavaScript String.trim(), including whitespace not covered by btrim's
  -- default ASCII space or by locale-dependent PostgreSQL character classes.
  whitespace text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  LOCK TABLE "questions" IN SHARE ROW EXCLUSIVE MODE;

  -- Validate the entire bank, including inactive content, before any UPDATE.
  FOR question IN SELECT id, options, correct_answer FROM "questions" LOOP
    IF jsonb_typeof(question.options) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'stable_option_ids: invalid question %: options must be an array', question.id;
    END IF;
    IF jsonb_array_length(question.options) <> 4 THEN
      RAISE EXCEPTION 'stable_option_ids: invalid question %: expected four options', question.id;
    END IF;

    option_kind := jsonb_typeof(question.options -> 0);
    IF option_kind NOT IN ('string', 'object') THEN
      RAISE EXCEPTION 'stable_option_ids: invalid question %: unsupported option type', question.id;
    END IF;
    option_ids := ARRAY[]::numeric[];

    FOR option_value IN SELECT value FROM jsonb_array_elements(question.options) LOOP
      IF jsonb_typeof(option_value) IS DISTINCT FROM option_kind THEN
        RAISE EXCEPTION 'stable_option_ids: invalid question %: mixed option types', question.id;
      END IF;

      IF option_kind = 'string' THEN
        option_text := option_value #>> '{}';
      ELSE
        IF jsonb_typeof(option_value -> 'id') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'stable_option_ids: invalid question %: option ID must be numeric', question.id;
        END IF;
        -- JSONB numbers are PostgreSQL numerics. Check in that type, rather than
        -- casting untrusted text to integer (which can overflow or round fractions).
        option_id := (option_value ->> 'id')::numeric;
        IF option_id < 0 OR option_id > 2147483647 OR option_id <> trunc(option_id) THEN
          RAISE EXCEPTION 'stable_option_ids: invalid question %: option ID outside integer range', question.id;
        END IF;
        IF option_id = ANY(option_ids) THEN
          RAISE EXCEPTION 'stable_option_ids: invalid question %: duplicate option ID', question.id;
        END IF;
        option_ids := array_append(option_ids, option_id);

        IF jsonb_typeof(option_value -> 'text') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'stable_option_ids: invalid question %: option text must be a string', question.id;
        END IF;
        option_text := option_value ->> 'text';
      END IF;

      IF option_text IS NULL OR btrim(option_text, whitespace) = '' THEN
        RAISE EXCEPTION 'stable_option_ids: invalid question %: blank option text', question.id;
      END IF;
    END LOOP;

    IF question.correct_answer IS NULL THEN
      RAISE EXCEPTION 'stable_option_ids: invalid question %: missing correct answer', question.id;
    END IF;
    IF option_kind = 'string' THEN
      IF question.correct_answer NOT BETWEEN 0 AND 3 THEN
        RAISE EXCEPTION 'stable_option_ids: invalid question %: legacy answer outside option positions', question.id;
      END IF;
    ELSIF NOT (question.correct_answer = ANY(option_ids)) THEN
      RAISE EXCEPTION 'stable_option_ids: invalid question %: correct answer is not an option ID', question.id;
    END IF;
  END LOOP;

  -- Canonical arrays are deliberately untouched: IDs, order, text, and any
  -- additional object fields survive verbatim, and replay is a no-op.
  UPDATE "questions" AS q
  SET options = (
    SELECT jsonb_agg(
      jsonb_build_object('id', position - 1, 'text', value #>> '{}')
      ORDER BY position
    )
    FROM jsonb_array_elements(q.options) WITH ORDINALITY AS original(value, position)
  )
  WHERE jsonb_typeof(q.options -> 0) = 'string';
END
$migration$;
