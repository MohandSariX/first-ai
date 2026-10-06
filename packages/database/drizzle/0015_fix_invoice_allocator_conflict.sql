-- Custom SQL migration file, put your code below! --
-- Qualify the conflict target: fiscal_year is also a RETURNS TABLE variable.
CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_org uuid, p_invoice uuid)
RETURNS TABLE(number text, issue_date date, issued_at timestamptz, time_zone text, fiscal_year integer)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_zone text; v_at timestamptz; v_date date; v_year integer; v_number integer;
  v_last_at timestamptz; v_last_date date; v_last_year integer;
BEGIN
  PERFORM 1 FROM public.invoices i WHERE i.id = p_invoice AND i.organization_id = p_org
    AND i.status = 'draft' AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft invoice unavailable' USING ERRCODE = '23514'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('invoice-fiscal:' || p_org::text, 0));
  SELECT o.timezone INTO v_zone FROM public.organizations o
    WHERE o.id = p_org AND o.status = 'active' AND o.deleted_at IS NULL;
  IF v_zone IS NULL THEN RAISE EXCEPTION 'Active organization unavailable' USING ERRCODE = '23514'; END IF;
  -- Clock sampled AFTER waiting, not transaction-start now(); milliseconds match JS Date exactly.
  v_at := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  v_date := (v_at AT TIME ZONE v_zone)::date;
  v_year := extract(year FROM v_date)::integer;
  SELECT max(c.last_issued_at), max(c.last_issue_date), max(c.fiscal_year)
    INTO v_last_at, v_last_date, v_last_year FROM public.invoice_number_counters c WHERE c.organization_id = p_org;
  IF v_at < v_last_at OR v_date < v_last_date OR v_year < v_last_year THEN
    RAISE EXCEPTION 'Issuance chronology would move backwards; reconcile clock/timezone/legacy history' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.invoice_number_counters AS c
    (organization_id, fiscal_year, last_number, last_issued_at, last_issue_date, last_invoice_id)
    VALUES (p_org, v_year, 1, v_at, v_date, p_invoice)
    ON CONFLICT ON CONSTRAINT invoice_number_counters_organization_id_fiscal_year_pk DO UPDATE SET last_number = c.last_number + 1,
      last_issued_at = v_at, last_issue_date = v_date, last_invoice_id = p_invoice
    RETURNING last_number INTO v_number;
  RETURN QUERY SELECT 'FAC-' || v_year::text || '-' || pg_catalog.lpad(v_number::text, 6, '0'), v_date, v_at, v_zone, v_year;
END;
$$;
