BEGIN;
CREATE TABLE IF NOT EXISTS trace_companies(id text PRIMARY KEY, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS trace_events(id text PRIMARY KEY, current_version integer NOT NULL CHECK(current_version>0), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS trace_event_companies(event_id text REFERENCES trace_events(id),company_id text REFERENCES trace_companies(id),PRIMARY KEY(event_id,company_id));
CREATE TABLE IF NOT EXISTS trace_documents(id text PRIMARY KEY,current_hash text NOT NULL,payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS trace_document_versions(document_id text REFERENCES trace_documents(id),hash text NOT NULL,payload jsonb NOT NULL,storage_path text NOT NULL,PRIMARY KEY(document_id,hash));
CREATE TABLE IF NOT EXISTS trace_event_versions(event_id text REFERENCES trace_events(id),version integer NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(event_id,version));
CREATE TABLE IF NOT EXISTS trace_claims(id text PRIMARY KEY,document_id text NOT NULL,document_hash text NOT NULL,payload jsonb NOT NULL,FOREIGN KEY(document_id,document_hash) REFERENCES trace_document_versions(document_id,hash));
CREATE TABLE IF NOT EXISTS trace_metadata(id text PRIMARY KEY,payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS trace_users(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS trace_follows(user_id text REFERENCES trace_users(id),target text NOT NULL,kind text NOT NULL CHECK(kind IN ('company','event')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,target,kind));
CREATE TABLE IF NOT EXISTS trace_reads(user_id text REFERENCES trace_users(id),target text NOT NULL,kind text NOT NULL CHECK(kind IN ('company','event')),version integer NOT NULL CHECK(version>=0),PRIMARY KEY(user_id,target,kind));
CREATE TABLE IF NOT EXISTS trace_notifications(user_id text REFERENCES trace_users(id),event_id text REFERENCES trace_events(id),version integer NOT NULL,payload jsonb NOT NULL,read_at timestamptz,PRIMARY KEY(user_id,event_id,version),FOREIGN KEY(event_id,version) REFERENCES trace_event_versions(event_id,version));
CREATE TABLE IF NOT EXISTS trace_runs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,kind text NOT NULL,status text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS trace_follows_target ON trace_follows(kind,target);
CREATE INDEX IF NOT EXISTS trace_notifications_unread ON trace_notifications(user_id,read_at);
CREATE OR REPLACE FUNCTION trace_block_version_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Historical evidence and judgment versions are immutable'; END; $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trace_event_version_immutable') THEN CREATE TRIGGER trace_event_version_immutable BEFORE UPDATE OR DELETE ON trace_event_versions FOR EACH ROW EXECUTE FUNCTION trace_block_version_mutation(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trace_document_version_immutable') THEN CREATE TRIGGER trace_document_version_immutable BEFORE UPDATE OR DELETE ON trace_document_versions FOR EACH ROW EXECUTE FUNCTION trace_block_version_mutation(); END IF;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['trace_companies','trace_events','trace_event_companies','trace_documents','trace_document_versions','trace_event_versions','trace_claims','trace_metadata','trace_users','trace_follows','trace_reads','trace_notifications','trace_runs'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION trace_block_version_mutation() FROM PUBLIC;
COMMIT;
