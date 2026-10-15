-- EWRP jobs table. Run once: psql -f api/migrations/ewrp_create_table.sql <connection>
CREATE TABLE IF NOT EXISTS ewrp_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    topic TEXT NOT NULL,
    num_slides INTEGER NOT NULL DEFAULT 5,
    status VARCHAR(50) DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    slides_json JSONB,
    pdf_path VARCHAR(500),
    html_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
