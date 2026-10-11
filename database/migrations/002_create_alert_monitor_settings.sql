BEGIN;

CREATE TABLE IF NOT EXISTS alert_monitor_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1
        CHECK (id = 1),

    symbols TEXT[] NOT NULL DEFAULT ARRAY[
        'BTC/USD',
        'ETH/USD',
        'SOL/USD'
    ]::TEXT[],

    timeframes TEXT[] NOT NULL DEFAULT ARRAY[
        '30m',
        '1H',
        '4H'
    ]::TEXT[],

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (CARDINALITY(symbols) BETWEEN 1 AND 5),
    CHECK (CARDINALITY(timeframes) BETWEEN 1 AND 5)
);

INSERT INTO alert_monitor_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMIT;
