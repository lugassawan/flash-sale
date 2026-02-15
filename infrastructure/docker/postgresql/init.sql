-- Flash Sale System — PostgreSQL Schema
-- This script runs automatically on first container start via docker-entrypoint-initdb.d

-- Products table (product + sale/promo configuration)
CREATE TABLE products (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku             VARCHAR(64)     NOT NULL UNIQUE,
    product_name    VARCHAR(255)    NOT NULL,
    initial_stock   INTEGER         NOT NULL CHECK (initial_stock > 0),
    start_time      TIMESTAMPTZ     NOT NULL,
    end_time        TIMESTAMPTZ     NOT NULL,
    state           VARCHAR(20)     NOT NULL DEFAULT 'UPCOMING',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(255)    NOT NULL,
    updated_at      TIMESTAMPTZ,
    updated_by      VARCHAR(255),

    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Purchase audit trail
CREATE TABLE purchases (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id      BIGINT          NOT NULL REFERENCES products(id),
    user_id         VARCHAR(255)    NOT NULL,
    purchased_at    TIMESTAMPTZ     NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(255)    NOT NULL,
    updated_at      TIMESTAMPTZ,
    updated_by      VARCHAR(255),

    -- Defense-in-depth: even if Redis dedup fails, PG enforces uniqueness
    CONSTRAINT uq_product_user UNIQUE (product_id, user_id)
);

-- Index for listing purchases by product
CREATE INDEX idx_purchases_product_id ON purchases(product_id, purchased_at);
